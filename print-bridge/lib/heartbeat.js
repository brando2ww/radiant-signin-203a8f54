"use strict";

// Batimento no banco. Existe para responder, do Mac e em um segundo, a
// pergunta que hoje exige AnyDesk: "a ponte do cliente está viva, em que
// versão, e as impressoras dela estão de pé?".
//
// De quebra mede o desvio de relógio da máquina. O PC do La Vecchia está ~30s
// adiantado, e como o `printed_at` era gravado com o relógio local, toda
// impressão de lá aparecia com 30s de latência (variância quase zero) enquanto
// o KOTEN mostrava 2-3s. Relógio errado também quebra TLS.

const { config } = require("./config");
const { log } = require("./log");
const db = require("./db");
const printers = require("./printers");
const worker = require("./worker");
const reconciler = require("./reconciler");
const journal = require("./journal");

const estadoRemoto = {
  clock_skew_ms: null,
  release: null,
  last_ok_at: null,
};

let identity = null;
let timer = null;
let panelToken = null;

async function bater() {
  if (!config.tenantUserId || !identity) return null;

  const lista = printers.snapshot();
  const [pending, stuck] = await Promise.all([db.countPending(true), db.countPending(false)]);

  const estado = {
    version: config.version,
    establishment_name: config.establishmentName,
    hostname: require("os").hostname(),
    pid: process.pid,
    started_at: worker.state.started_at,
    realtime_status: reconciler.rt.status,
    realtime_last_event_at: reconciler.rt.lastEventAt,
    poll_last_ok_at: worker.state.last_reconcile_ok_at,
    jobs_processed: worker.state.jobs_processed,
    jobs_failed: worker.state.jobs_failed,
    pending_count: pending,
    stuck_count: stuck,
    clock_skew_ms: estadoRemoto.clock_skew_ms,
    printers: lista,
    panel_token: panelToken,
    update_state: journal.available ? "ok" : "sem-diario",
  };

  const enviadoEm = Date.now();
  const resposta = await db.sync(identity, estado);
  if (!resposta) return null;

  estadoRemoto.last_ok_at = new Date().toISOString();

  if (resposta.server_time) {
    // Metade do tempo de ida e volta é a melhor estimativa que temos do
    // instante em que o servidor respondeu.
    const rtt = Date.now() - enviadoEm;
    const skew = Date.now() - (Date.parse(resposta.server_time) + rtt / 2);
    const anterior = estadoRemoto.clock_skew_ms;
    estadoRemoto.clock_skew_ms = Math.round(skew);
    if (Math.abs(skew) > 60000 && (anterior === null || Math.abs(anterior) <= 60000)) {
      log(
        `⚠ O relógio deste computador está ${Math.round(skew / 1000)}s fora do horário do servidor. ` +
          `Corrija em Configurações de Data e Hora do Windows.`,
      );
    }
  }

  if (Array.isArray(resposta.centers) && resposta.centers.length > 0) {
    for (const c of resposta.centers) {
      const alvo = String(c.printer_ip || "").trim();
      if (!alvo) continue;
      const e = printers.entry(alvo);
      if (c.name) e.centers.add(c.name);
      e.port = c.printer_port || e.port || 9100;
    }
  }

  estadoRemoto.release = resposta.release || null;
  return resposta;
}

function start(id, token) {
  identity = id;
  panelToken = token;
  const executar = () => bater().catch((e) => log(`⚠ heartbeat: ${e.message}`));
  executar();
  timer = setInterval(executar, config.heartbeatIntervalMs);
  timer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
}

module.exports = { start, stop, bater, estadoRemoto };
