"use strict";

// Acesso ao Supabase. Concentra aqui todo SQL/RPC para que o resto do código
// não precise saber se o banco já tem as funções da v2.
//
// Degradação deliberada: se as RPCs ainda não existirem (bridge nova rodando
// contra um banco sem a migration), tudo cai para o caminho antigo, com o
// UPDATE condicional inline. Uma bridge atualizada não pode parar de imprimir
// por causa da ordem em que as coisas subiram.

const ws = require("ws");
const { createClient } = require("@supabase/supabase-js");

const { config } = require("./config");
const { log, logOnce } = require("./log");

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 10 },
    transport: ws,
    // Sem heartbeat explícito, socket morto demora a ser percebido — e enquanto
    // isso o painel continua verde jurando que está tudo certo.
    heartbeatIntervalMs: 15000,
  },
});

// Descoberto no primeiro uso e lembrado: evita pagar um erro por chamada num
// banco antigo.
const rpcOk = { claim: null, sync: null, centers: null };

function faltaFuncao(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return (
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

// ─── Reivindicação ───────────────────────────────────────────────────────

/**
 * Reivindica um lote de jobs (pendentes + órfãos com lease vencido).
 * É o caminho que não pode falhar: com ele, nenhum pedido se perde mesmo que
 * o Realtime nunca mais conecte.
 */
async function claimBatch(deviceId, limit = config.reconcileBatch) {
  if (rpcOk.claim !== false) {
    const { data, error } = await supabase.rpc("print_bridge_claim_batch", {
      p_tenant: config.tenantUserId,
      p_device: deviceId,
      p_limit: limit,
      p_max_age_minutes: config.reconcileMaxAgeMin,
      p_lease_seconds: config.leaseSeconds,
      p_max_attempts: config.hardMaxAttempts,
    });
    if (!error) {
      rpcOk.claim = true;
      return data || [];
    }
    if (!faltaFuncao(error)) throw error;
    rpcOk.claim = false;
    log("⚠ Banco ainda sem print_bridge_claim_batch — usando o caminho antigo (reivindicação linha a linha)");
  }
  return claimBatchLegacy(limit);
}

/** Caminho antigo: seleciona pendentes e reivindica um a um. */
async function claimBatchLegacy(limit) {
  const desde = new Date(Date.now() - config.reconcileMaxAgeMin * 60 * 1000).toISOString();
  let q = supabase
    .from("pdv_print_jobs")
    .select("*")
    .eq("status", "pending")
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (config.tenantUserId) q = q.eq("tenant_user_id", config.tenantUserId);
  const { data, error } = await q;
  if (error) throw error;

  const claimed = [];
  for (const job of data || []) {
    const ok = await claimOne(job.id, null, job.attempts || 0);
    if (ok) claimed.push({ ...job, attempts: (job.attempts || 0) + 1 });
  }
  return claimed;
}

/**
 * Reivindica um job específico (caminho do Realtime).
 * @returns o job reivindicado, ou null se outra instância chegou antes.
 */
async function claimOne(jobId, deviceId, attemptsConhecidas = null) {
  if (rpcOk.claim !== false) {
    const { data, error } = await supabase.rpc("print_bridge_claim_one", {
      p_job_id: jobId,
      p_device: deviceId,
      p_max_attempts: config.hardMaxAttempts,
    });
    if (!error) return (data && data[0]) || null;
    if (!faltaFuncao(error)) throw error;
    rpcOk.claim = false;
  }
  const { data, error } = await supabase
    .from("pdv_print_jobs")
    .update({ status: "printing", attempts: (attemptsConhecidas || 0) + 1 })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*");
  if (error) throw error;
  return (data && data[0]) || null;
}

/** Mantém o lease vivo enquanto tentamos imprimir (retries internos). */
async function renewLease(jobId, deviceId) {
  if (rpcOk.claim === false) return;
  const { error } = await supabase.rpc("print_bridge_renew_lease", {
    p_job_id: jobId,
    p_device: deviceId,
  });
  if (error && !faltaFuncao(error)) log(`⚠ renovação de lease: ${error.message}`);
}

// ─── Desfechos ───────────────────────────────────────────────────────────

async function confirmPrinted(jobId, deviceId) {
  if (config.chaosFailConfirm > 0 && Math.random() < config.chaosFailConfirm) {
    throw new Error("[caos] falha simulada ao confirmar no banco");
  }
  const patch = { status: "printed", error_message: null };
  // printed_at é sobrescrito pelo trigger com now() do servidor; mandamos
  // mesmo assim para bancos que ainda não têm o trigger.
  patch.printed_at = new Date().toISOString();
  if (deviceId) patch.printed_by = deviceId;

  let { error } = await supabase.from("pdv_print_jobs").update(patch).eq("id", jobId);
  if (error && faltaFuncao(error)) {
    // Banco sem as colunas novas.
    delete patch.printed_by;
    ({ error } = await supabase.from("pdv_print_jobs").update(patch).eq("id", jobId));
  }
  if (error) throw error;
}

async function markFailed(jobId, message) {
  const { error } = await supabase
    .from("pdv_print_jobs")
    .update({ status: "failed", error_message: String(message).slice(0, 500) })
    .eq("id", jobId);
  if (error) throw error;
}

/** Devolve o job para a fila (ex.: impressora em quarentena). */
async function releaseToPending(jobId, message) {
  const { error } = await supabase
    .from("pdv_print_jobs")
    .update({ status: "pending", error_message: message ? String(message).slice(0, 500) : null })
    .eq("id", jobId);
  if (error) throw error;
}

async function loadJob(jobId) {
  const { data, error } = await supabase
    .from("pdv_print_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Contadores do painel ────────────────────────────────────────────────
// "Na fila" é o que a bridge ainda vai imprimir. Pendente de dias atrás não
// sai mais sozinho (está fora da janela), então contá-lo como fila faz o
// painel gritar sem motivo — no KOTEN apareceram 3 que eram de 8 e 17 de julho.

async function countPending(dentroDaJanela = true) {
  const corte = new Date(Date.now() - config.reconcileMaxAgeMin * 60 * 1000).toISOString();
  let q = supabase
    .from("pdv_print_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  q = dentroDaJanela ? q.gte("created_at", corte) : q.lt("created_at", corte);
  if (config.tenantUserId) q = q.eq("tenant_user_id", config.tenantUserId);
  const { count, error } = await q;
  if (error) return null;
  return count ?? 0;
}

/** Jobs antigos que o reconciliador não vai buscar — o painel oferece imprimir à mão. */
async function listStuck(limit = 50) {
  const corte = new Date(Date.now() - config.reconcileMaxAgeMin * 60 * 1000).toISOString();
  let q = supabase
    .from("pdv_print_jobs")
    .select("id, created_at, center_name, printer_ip, source_kind")
    .eq("status", "pending")
    .lt("created_at", corte)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (config.tenantUserId) q = q.eq("tenant_user_id", config.tenantUserId);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

// ─── Heartbeat ───────────────────────────────────────────────────────────

/**
 * Uma chamada a cada 30s: publica o estado da instalação e recebe de volta a
 * hora do servidor (para medir desvio de relógio), os centros configurados e o
 * manifesto de atualização.
 */
async function sync(identity, estado) {
  if (rpcOk.sync === false) return null;
  const { data, error } = await supabase.rpc("print_bridge_sync", {
    p_install_id: identity.install_id,
    p_tenant: config.tenantUserId,
    p_secret: identity.secret,
    p_state: estado,
  });
  if (error) {
    if (faltaFuncao(error)) {
      rpcOk.sync = false;
      log("⚠ Banco ainda sem print_bridge_sync — heartbeat desligado até a migration subir");
      return null;
    }
    logOnce("sync-erro", 60000, `⚠ heartbeat: ${error.message}`);
    return null;
  }
  rpcOk.sync = true;
  return data;
}

/**
 * Centros configurados. A tabela pdv_production_centers exige sessão
 * autenticada (RLS is_establishment_member) e a bridge só tem a chave anônima;
 * por isso a RPC. Sem ela, o painel só conhecia impressora que já tinha
 * impresso alguma vez.
 */
async function centers() {
  if (rpcOk.centers === false || !config.tenantUserId) return null;
  const { data, error } = await supabase.rpc("print_bridge_centers", { p_tenant: config.tenantUserId });
  if (error) {
    if (faltaFuncao(error)) rpcOk.centers = false;
    return null;
  }
  rpcOk.centers = true;
  return data || [];
}

/** Fallback histórico: descobre impressoras pelo que já imprimiu. */
async function centersFromHistory() {
  if (!config.tenantUserId) return [];
  const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pdv_print_jobs")
    .select("center_name, printer_ip, printer_port, created_at")
    .eq("tenant_user_id", config.tenantUserId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return [];
  return (data || []).map((j) => ({
    name: j.center_name,
    printer_ip: j.printer_ip,
    printer_port: j.printer_port || 9100,
  }));
}

module.exports = {
  supabase,
  claimBatch,
  claimOne,
  renewLease,
  confirmPrinted,
  markFailed,
  releaseToPending,
  loadJob,
  countPending,
  listStuck,
  sync,
  centers,
  centersFromHistory,
  rpcOk,
};
