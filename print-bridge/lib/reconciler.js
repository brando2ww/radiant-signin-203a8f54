"use strict";

// O coração da v2: a fila do banco é varrida por conta própria, a cada 20s.
//
// Até a 1.5.0 o único caminho de trabalho em regime normal era o evento do
// Realtime, e o reprocesso de pendentes só rodava no boot, limitado a 2h. Se o
// WebSocket morresse calado — e ele morre, porque o event loop congelava
// durante cada impressão USB —, o pedido ficava `pending` com attempts=0 e
// error_message NULL, para sempre. Foi assim com o job de 02/08 do La Vecchia e
// com três do KOTEN em julho.
//
// Agora o Realtime é só um acelerador de latência. Se ele nunca mais conectar,
// tudo continua imprimindo, com no máximo 20s de atraso.

const { config } = require("./config");
const { log, logOnce } = require("./log");
const db = require("./db");
const worker = require("./worker");

const rt = {
  status: "connecting",
  channel: null,
  reconnectTimer: null,
  reconnectDelay: 30000,
  lastEventAt: null,
  // Ids entregues pelo Realtime há pouco. Serve para detectar o socket que diz
  // estar inscrito mas não entrega nada.
  entregues: new Map(),
  perdidos: [],
};

const MAX_DELAY = 5 * 60 * 1000;
const JANELA_PERDIDOS_MS = 10 * 60 * 1000;
const PERDIDOS_PARA_DERRUBAR = 2;

let pollTimer = null;
let rodando = false;

// ─── Polling ─────────────────────────────────────────────────────────────

function registrarPerda(job) {
  // Só conta como perda se o Realtime estava supostamente ativo e o job é novo
  // o bastante para que o evento devesse ter chegado.
  if (rt.status !== "SUBSCRIBED") return;
  const idade = Date.now() - Date.parse(job.created_at || "");
  if (!(idade > 5000 && idade < 5 * 60 * 1000)) return;
  if (rt.entregues.has(job.id)) return;

  const agora = Date.now();
  rt.perdidos = rt.perdidos.filter((t) => agora - t < JANELA_PERDIDOS_MS);
  rt.perdidos.push(agora);

  if (rt.perdidos.length >= PERDIDOS_PARA_DERRUBAR) {
    log(
      `⚠ Realtime diz SUBSCRIBED mas ${rt.perdidos.length} job(s) chegaram só pelo polling — ` +
        `socket zumbi, derrubando e reconectando`,
    );
    rt.perdidos = [];
    reconectar("socket zumbi");
  }
}

async function umaVolta() {
  const jobs = await db.claimBatch(worker.deviceId());
  if (jobs.length === 0) return 0;

  log(`⟳ Reconciliador assumiu ${jobs.length} job(s) da fila do banco`);
  // Em paralelo: a serialização acontece por impressora, dentro da fila. Um
  // `for await` aqui faria uma impressora travada segurar todas as outras —
  // era exatamente o que acontecia no reprocesso de boot.
  await Promise.allSettled(
    jobs.map((job) => {
      registrarPerda(job);
      return worker.processJob(job, { claimed: true });
    }),
  );
  return jobs.length;
}

async function tick() {
  if (rodando) return;
  rodando = true;
  try {
    // Drena enquanto vier lote cheio, com teto para não monopolizar o processo.
    for (let volta = 0; volta < 5; volta++) {
      const n = await umaVolta();
      if (n < config.reconcileBatch) break;
    }
    worker.state.last_reconcile_ok_at = new Date().toISOString();
    await worker.drenarConfirmacoes();
    limparEntregues();
  } catch (e) {
    logOnce("reconcile-erro", 60000, `✗ reconciliador: ${e.message}`);
  } finally {
    rodando = false;
  }
}

function limparEntregues() {
  const limite = Date.now() - JANELA_PERDIDOS_MS;
  for (const [id, at] of rt.entregues) if (at < limite) rt.entregues.delete(id);
}

// ─── Realtime ────────────────────────────────────────────────────────────

function reconectar(motivo) {
  // Dedup: CHANNEL_ERROR seguido de CLOSED, mais o CLOSED que o próprio
  // removeChannel dispara, agendavam três reconexões concorrentes — cada uma
  // criando um canal novo.
  if (rt.reconnectTimer) return;
  log(`⟳ Reconectando Realtime em ${Math.round(rt.reconnectDelay / 1000)}s (${motivo})`);
  rt.reconnectTimer = setTimeout(() => {
    rt.reconnectTimer = null;
    rt.reconnectDelay = Math.min(Math.round(rt.reconnectDelay * 1.5), MAX_DELAY);
    conectar();
  }, rt.reconnectDelay);
}

function conectar() {
  if (rt.channel) {
    const antigo = rt.channel;
    rt.channel = null;
    db.supabase.removeChannel(antigo).catch(() => {});
  }
  const nome = `print-bridge-${Date.now()}`;
  log(`→ Conectando Realtime (${nome}) — escutando pdv_print_jobs...`);
  rt.status = "connecting";

  // Com mais de um estabelecimento na tabela, ouvir a tabela inteira faz a
  // bridge de um cliente imprimir o pedido do outro.
  const filtro = {
    event: "INSERT",
    schema: "public",
    table: "pdv_print_jobs",
    ...(config.tenantUserId ? { filter: `tenant_user_id=eq.${config.tenantUserId}` } : {}),
  };

  rt.channel = db.supabase
    .channel(nome)
    .on("postgres_changes", filtro, (payload) => {
      rt.lastEventAt = new Date().toISOString();
      const job = payload?.new;
      if (!job || job.status !== "pending") return;
      // Rede de segurança: se o filtro do servidor falhar, não imprime job de
      // outro dono.
      if (config.tenantUserId && job.tenant_user_id !== config.tenantUserId) return;
      rt.entregues.set(job.id, Date.now());
      log(`📥 Novo job ${job.id} pelo Realtime`);
      worker.processJob(job, { claimed: false }).catch((e) => log(`✗ processJob: ${e.message}`));
    })
    .subscribe((status, err) => {
      rt.status = status;
      if (status === "SUBSCRIBED") {
        rt.reconnectDelay = 30000;
        rt.lastEventAt = rt.lastEventAt || new Date().toISOString();
        log(`✓ Realtime conectado (PID ${process.pid})`);
        // Reconciliar após CADA conexão, não só no boot: o que entrou durante
        // a queda tem de sair agora, não no próximo restart do serviço.
        tick().catch(() => {});
      } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
        log(`✗ Realtime ${status}${err ? `: ${err.message}` : ""}`);
        reconectar(status);
      }
    });
}

/** Socket que morreu sem avisar: o cliente jura estar inscrito e nada chega. */
function watchdog() {
  try {
    const conectado = db.supabase.realtime?.isConnected?.();
    if (rt.status === "SUBSCRIBED" && conectado === false) {
      log("⚠ Realtime marcado como SUBSCRIBED com o socket fechado — reconectando");
      reconectar("socket fechado");
    }
  } catch (_) {
    // isConnected() é detalhe interno do supabase-js; se sumir, o sinal dos
    // jobs que chegam só pelo polling continua cobrindo o caso.
  }
}

function start() {
  conectar();
  tick().catch(() => {});
  pollTimer = setInterval(() => {
    tick().catch(() => {});
    watchdog();
  }, config.reconcileIntervalMs);
  pollTimer.unref?.();
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  if (rt.reconnectTimer) clearTimeout(rt.reconnectTimer);
}

/**
 * Saúde de verdade, a que pinta o painel e o ícone de bandeja: trabalhou ou
 * conferiu a fila há pouco. O `subscription_status` sozinho mentia.
 */
function saudavel() {
  const ref = worker.state.last_reconcile_ok_at || worker.state.last_print_at;
  if (!ref) return false;
  return Date.now() - Date.parse(ref) < config.reconcileIntervalMs * 3;
}

module.exports = { start, stop, tick, rt, saudavel };
