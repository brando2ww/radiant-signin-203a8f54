"use strict";

// Execução de um job: reivindicar, imprimir, registrar no diário, confirmar.
//
// A ordem importa e não é a intuitiva. Gravamos no diário local ANTES de
// confirmar no banco, porque a falha que dói não é "o banco não soube", é "o
// cupom saiu duas vezes". Quem sabe o que saiu no papel é esta máquina.

const { config } = require("./config");
const { log, logOnce } = require("./log");
const db = require("./db");
const io = require("./printer-io");
const queue = require("./queue");
const journal = require("./journal");
const printers = require("./printers");
const receipts = require("./receipts");

const state = {
  started_at: new Date().toISOString(),
  last_job_at: null,
  last_print_at: null,
  last_error: null,
  jobs_processed: 0,
  jobs_failed: 0,
  // "Saudável" não é mais "o socket diz que está inscrito", e sim "trabalhou
  // ou conferiu a fila há pouco". Foi o painel verde durante uma queda que
  // deixou o problema do KOTEN invisível por dois dias.
  last_reconcile_ok_at: null,
};

let identity = null;
function setIdentity(id) {
  identity = id;
}
const deviceId = () => identity?.install_id || null;

/** Jobs em processamento agora: evita que Realtime e polling façam o mesmo trabalho. */
const emVoo = new Set();

/** Jobs impressos cujo `printed` ainda não entrou no banco. */
async function confirmarNoBanco(jobId) {
  try {
    await db.confirmPrinted(jobId, deviceId());
    journal.markConfirmed(jobId);
    return true;
  } catch (e) {
    // NÃO reimprime. O papel já saiu; o que falta é só o banco saber disso.
    logOnce(
      `confirm-${jobId}`,
      30000,
      `⚠ Impresso, mas o banco não confirmou (job ${jobId}): ${e.message} — vou insistir em segundo plano`,
    );
    return false;
  }
}

/** Reconciliação da confirmação: roda em segundo plano até o banco aceitar. */
async function drenarConfirmacoes() {
  const pendentes = journal.pendingConfirms();
  if (pendentes.length === 0) return;
  for (const jobId of pendentes) {
    const ok = await confirmarNoBanco(jobId);
    if (!ok) return; // banco fora do ar: tenta tudo de novo no próximo ciclo
  }
  log(`✓ ${pendentes.length} impressão(ões) confirmada(s) no banco com atraso`);
}

/**
 * Tenta imprimir, com retries. O job permanece em `printing` durante as
 * tentativas, com o lease renovado — assim o reconciliador não reivindica algo
 * que está sendo impresso neste instante.
 */
async function imprimirComTentativas(job, buf, key) {
  const alvo = io.normalizeIp(String(job.printer_ip).trim());

  for (let tentativa = 1; tentativa <= config.maxAttempts; tentativa++) {
    try {
      await queue.enqueue(key, ({ signal }) => io.routePrint(job, buf, { signal })).promise;

      // Ponto sem volta: daqui em diante este job NÃO pode ser impresso de novo.
      journal.markPrinted(job.id);
      queue.recordSuccess(key);
      const e = printers.markPrinted(alvo, job.center_name);
      e.port = job.printer_port || e.port;
      state.jobs_processed += 1;
      state.last_print_at = e.last_print_at;
      state.last_error = null;
      log(`✓ Impresso job ${job.id} → ${key}`);

      await confirmarNoBanco(job.id);
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      state.last_error = msg;
      queue.recordFailure(key);
      printers.markError(alvo, job.center_name, msg);

      if (tentativa < config.maxAttempts) {
        const espera = config.retryDelaysMs[tentativa - 1] || 3000;
        log(`🔁 Tentativa ${tentativa}/${config.maxAttempts} do job ${job.id} falhou (${msg}) — nova tentativa em ${espera}ms`);
        await db.renewLease(job.id, deviceId()).catch(() => {});
        await queue.sleep(espera);
        continue;
      }

      log(`✗ Falha definitiva [${key}] — ${msg} (job ${job.id}, ${config.maxAttempts} tentativas)`);
      state.jobs_failed += 1;
      await db.markFailed(job.id, msg).catch((e) => log(`✗ ao marcar falha: ${e.message}`));
      return false;
    }
  }
  return false;
}

/**
 * @param job linha de pdv_print_jobs
 * @param opts.claimed true quando o job já veio reivindicado (vindo do lote do
 *   reconciliador); false quando é um aviso do Realtime e precisamos disputar.
 */
async function processJob(job, { claimed = false } = {}) {
  if (!job || !job.id) return;
  if (emVoo.has(job.id)) return;
  emVoo.add(job.id);

  try {
    state.last_job_at = new Date().toISOString();

    // Já saiu no papel numa vida anterior deste processo? Então só falta
    // avisar o banco. É isto que permite recuperar órfão sem reimprimir.
    if (journal.hasPrinted(job.id)) {
      log(`↺ Job ${job.id} já havia sido impresso — confirmando sem reimprimir`);
      await confirmarNoBanco(job.id);
      return;
    }

    if (!job.printer_ip || !String(job.printer_ip).trim()) {
      const msg = "sem impressora configurada";
      log(`⚠ Job ${job.id} sem printer_ip — falhando`);
      await db.markFailed(job.id, msg).catch(() => {});
      state.jobs_failed += 1;
      state.last_error = msg;
      return;
    }

    const key = io.queueKey(job);

    // Impressora em quarentena ou fila cheia: devolve para a fila do banco em
    // vez de marcar falha. Sem papel é condição transitória — o pedido tem de
    // sair quando alguém repuser.
    if (!queue.canAccept(key)) {
      const ate = queue.quarantinedUntil(key);
      const motivo = ate
        ? `impressora em quarentena até ${new Date(ate).toLocaleTimeString("pt-BR")}`
        : `fila cheia (${queue.depth(key)} jobs)`;
      logOnce(`espera-${key}`, 30000, `⏸ Job ${job.id} adiado: ${motivo}`);
      if (claimed) await db.releaseToPending(job.id, `aguardando: ${motivo}`).catch(() => {});
      return;
    }

    if (!claimed) {
      const reivindicado = await db.claimOne(job.id, deviceId(), job.attempts || 0);
      if (!reivindicado) return; // outra instância (ou o polling) chegou antes
      job = reivindicado;
    }

    const buf = receipts.buildJobReceipt(job, config.establishmentName, config.version, config.printCols);
    log(
      `→ Job ${job.id} | kind=${job.source_kind} | centro=${job.center_name} | ` +
        `${receipts.jobSummary(job)} → ${key}`,
    );
    await imprimirComTentativas(job, buf, key);
  } catch (e) {
    log(`✗ processJob ${job?.id}: ${e.message}`);
  } finally {
    emVoo.delete(job.id);
  }
}

/** Reimpressão manual: força o job de volta para a fila, ignorando o diário. */
async function reprint(jobId) {
  journal.forget(jobId); // desarma a proteção: aqui a repetição é o pedido
  await db.releaseToPending(jobId, null);
  const job = await db.loadJob(jobId);
  if (!job) throw new Error("job não encontrado");
  if (config.tenantUserId && job.tenant_user_id !== config.tenantUserId) {
    throw new Error("job é de outro estabelecimento");
  }
  emVoo.delete(jobId);
  const claimed = await db.claimOne(jobId, deviceId(), job.attempts || 0);
  if (!claimed) throw new Error("não foi possível reivindicar o job");
  const buf = receipts.buildJobReceipt(claimed, config.establishmentName, config.version, config.printCols);
  const key = io.queueKey(claimed);
  const ok = await imprimirComTentativas(claimed, buf, key);
  if (!ok) throw new Error(state.last_error || "falha ao imprimir");
}

module.exports = {
  state,
  processJob,
  reprint,
  drenarConfirmacoes,
  setIdentity,
  deviceId,
};
