"use strict";

// Anel dos últimos eventos, para a aba "Detalhes" do painel. Sem isto o cliente
// precisaria abrir arquivo em Program Files para contar o que houve.

const LOG_MAX = 300;
const logRing = [];

const ts = () => new Date().toTimeString().slice(0, 8);

function log(...args) {
  const msg = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  logRing.push({ at: new Date().toISOString(), msg });
  if (logRing.length > LOG_MAX) logRing.shift();
  console.log(`[${ts()}]`, ...args);
}

/**
 * Log com supressão de repetição. Erro de rede em loop de 20s encheria o anel
 * de 300 linhas em 100 minutos e apagaria todo o histórico útil.
 */
const throttled = new Map();
function logOnce(key, everyMs, ...args) {
  const now = Date.now();
  const last = throttled.get(key) || 0;
  if (now - last < everyMs) return;
  throttled.set(key, now);
  log(...args);
}

function tail(n = 120) {
  return logRing.slice(-n).reverse();
}

module.exports = { log, logOnce, tail, ts };
