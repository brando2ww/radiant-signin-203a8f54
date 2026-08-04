"use strict";

// Fila por impressora, com timeout de verdade e quarentena.
//
// Três defeitos da versão anterior moravam aqui:
//  · nenhuma tarefa tinha timeout, então uma que nunca resolvesse (porta COM
//    travada, PowerShell pendurado) segurava aquela impressora para sempre —
//    e os jobs ficavam `pending` com attempts=0, sem erro nenhum no banco;
//  · a profundidade não tinha teto, então uma impressora fora do ar acumulava
//    trabalho indefinidamente;
//  · uma impressora com defeito era tentada de novo a cada job, gastando o
//    timeout inteiro toda vez, o que atrasava as impressoras saudáveis quando
//    o caminho era síncrono.

const { config } = require("./config");
const { log } = require("./log");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** key → { promise, depth } */
const queues = new Map();
/** key → { fails, openUntil, level } */
const breakers = new Map();

function breaker(key) {
  if (!breakers.has(key)) breakers.set(key, { fails: 0, openUntil: 0, level: 0 });
  return breakers.get(key);
}

function depth(key) {
  return queues.get(key)?.depth || 0;
}

/**
 * A impressora está em quarentena?
 * Em quarentena o job NÃO é reivindicado (continua `pending` para a próxima
 * volta do reconciliador) em vez de ser marcado `failed`: impressora sem papel
 * é condição transitória, e o pedido tem de sair quando alguém repuser.
 */
function quarantinedUntil(key) {
  const b = breakers.get(key);
  if (!b || b.openUntil <= Date.now()) return null;
  return b.openUntil;
}

/** Aceita mais trabalho para esta impressora agora? */
function canAccept(key) {
  if (quarantinedUntil(key)) return false;
  return depth(key) < config.maxQueueDepth;
}

function recordSuccess(key) {
  const b = breaker(key);
  if (b.fails > 0 || b.openUntil) log(`✓ ${key} voltou ao normal`);
  b.fails = 0;
  b.openUntil = 0;
  b.level = 0;
}

function recordFailure(key) {
  const b = breaker(key);
  b.fails += 1;
  if (b.fails >= config.breakerThreshold) {
    const espera = config.breakerBackoffMs[Math.min(b.level, config.breakerBackoffMs.length - 1)];
    b.openUntil = Date.now() + espera;
    b.level += 1;
    // Meia-abertura: passado o tempo, UM job tenta. Se der certo, zera; se
    // falhar, o próximo intervalo é maior.
    b.fails = config.breakerThreshold - 1;
    log(`⏸ ${key} em quarentena por ${Math.round(espera / 1000)}s após ${config.breakerThreshold} falhas seguidas`);
  }
}

/**
 * Enfileira uma tarefa para uma impressora. As tarefas da mesma impressora
 * rodam em série (bytes de dois cupons intercalados saem ilegíveis); as de
 * impressoras diferentes correm em paralelo.
 *
 * A tarefa recebe `{ signal }` e é obrigada a respeitá-lo: no estouro do
 * timeout o socket é destruído e o processo filho recebe SIGKILL.
 */
function enqueue(key, taskFn, { timeoutMs = config.jobTimeoutMs } = {}) {
  const slot = queues.get(key) || { promise: Promise.resolve(), depth: 0 };
  slot.depth += 1;

  const run = async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await taskFn({ signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const next = slot.promise
    .catch(() => {})
    .then(run)
    .finally(async () => {
      await sleep(config.postPrintDelayMs);
      const cur = queues.get(key);
      if (cur) {
        cur.depth -= 1;
        if (cur.depth <= 0 && cur.promise === next) queues.delete(key);
      }
    });

  slot.promise = next;
  queues.set(key, slot);
  return { promise: next, depth: slot.depth };
}

function snapshot() {
  const out = {};
  for (const [key, slot] of queues) out[key] = { depth: slot.depth };
  for (const [key, b] of breakers) {
    if (b.openUntil > Date.now()) {
      out[key] = { ...(out[key] || { depth: 0 }), quarantined_until: new Date(b.openUntil).toISOString() };
    }
  }
  return out;
}

module.exports = {
  enqueue,
  canAccept,
  depth,
  quarantinedUntil,
  recordSuccess,
  recordFailure,
  snapshot,
  sleep,
};
