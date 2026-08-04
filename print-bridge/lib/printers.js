"use strict";

// Estado por impressora: quem está no ar, quem está sem papel, quantos
// documentos estão presos na fila do Windows. Antes só existia o estado
// global, que não dizia QUAL bancada estava fora — e foi isso que fez a falha
// do KOTEN passar dois dias despercebida.

const { config } = require("./config");
const { log } = require("./log");
const db = require("./db");
const io = require("./printer-io");
const winSpool = require("./win-spool");
const queue = require("./queue");

/** alvo (ip normalizado ou nome Windows) → entrada */
const printers = new Map();

function entry(target) {
  const key = io.normalizeIp(String(target || "").trim());
  if (!printers.has(key)) {
    printers.set(key, {
      target: key,
      port: 9100,
      centers: new Set(),
      online: null, // null = ainda não sondada
      queued: null, // documentos presos na fila do Windows (só impressora USB)
      last_print_at: null,
      last_error: null,
      last_error_at: null,
      checked_at: null,
    });
  }
  return printers.get(key);
}

function markPrinted(target, centerName) {
  const e = entry(target);
  if (centerName) e.centers.add(centerName);
  e.online = true;
  e.last_print_at = new Date().toISOString();
  e.last_error = null;
  return e;
}

function markError(target, centerName, msg) {
  const e = entry(target);
  if (centerName) e.centers.add(centerName);
  e.online = false;
  e.last_error = msg;
  e.last_error_at = new Date().toISOString();
  return e;
}

/**
 * Descobre o que ESTÁ CONFIGURADO (não só o que já imprimiu). A RPC é a fonte
 * boa; o histórico fica de reserva para banco que ainda não tem a migration.
 */
async function refreshConfigured() {
  let lista = await db.centers();
  let origem = "cadastro";
  if (!lista) {
    lista = await db.centersFromHistory();
    origem = "histórico";
  }
  for (const c of lista) {
    const alvo = String(c.printer_ip || "").trim();
    if (!alvo) continue;
    const e = entry(alvo);
    if (c.name) e.centers.add(c.name);
    e.port = c.printer_port || e.port || 9100;
  }
  return { origem, total: lista.length };
}

/** Testa cada alvo conhecido. É o que permite avisar antes de faltar cupom. */
async function probeAll() {
  const win = await winSpool.probePrinters();
  const nomes = win.names.map((n) => String(n).toLowerCase());

  await Promise.all(
    [...printers.values()].map(async (e) => {
      const kind = io.targetKind(e.target);
      if (kind === "rede") {
        e.online = await io.probeTcp(e.target, e.port || 9100);
        if (!e.online) e.last_error = e.last_error || "não responde no IP configurado";
      } else if (kind === "serial") {
        e.online = null; // porta serial só dá para saber ao imprimir
      } else {
        // Impressora Windows: comparação sem caixa porque o cadastro guarda o
        // que o usuário digitou ("bar" vs "Bar").
        const alvo = e.target.toLowerCase();
        const st = win.byName.get(alvo);
        e.queued = st ? st.queued : null;
        if (winSpool.isWindows && !config.fakeWindows) {
          if (!nomes.includes(alvo)) {
            e.online = false;
            e.last_error = `Impressora "${e.target}" não existe neste Windows`;
            e.last_error_at = new Date().toISOString();
          } else if (st && st.problems.length > 0) {
            e.online = false;
            e.last_error = `${st.problems.join(", ")}${st.queued > 0 ? ` — ${st.queued} documento(s) preso(s) na fila` : ""}`;
            e.last_error_at = new Date().toISOString();
          } else {
            e.online = true;
            e.last_error = null;
          }
        }
      }
      e.checked_at = new Date().toISOString();
    }),
  );
}

let sondando = false;
async function cicloDeSondagem() {
  // Guarda contra sobreposição: com PowerShell lento, dois ciclos concorrentes
  // dobrariam o custo sem informação nova.
  if (sondando) return;
  sondando = true;
  try {
    await refreshConfigured();
    await probeAll();
  } catch (e) {
    log(`✗ sondagem: ${e.message}`);
  } finally {
    sondando = false;
  }
}

/** Lista para o painel, o heartbeat e o ícone de bandeja. */
function snapshot() {
  const filas = queue.snapshot();
  return [...printers.values()].map((e) => {
    const key = io.targetKind(e.target) === "rede" ? `${e.target}:${e.port || 9100}` : e.target;
    const fila = filas[key] || {};
    return {
      target: e.target,
      centers: [...e.centers],
      online: e.online,
      queued: e.queued ?? null,
      last_print_at: e.last_print_at,
      last_error: e.last_error,
      last_error_at: e.last_error_at,
      checked_at: e.checked_at,
      kind: io.targetKind(e.target),
      queue_depth: fila.depth || 0,
      quarantined_until: fila.quarantined_until || null,
    };
  });
}

function anyOffline() {
  return [...printers.values()].some((e) => e.online === false);
}

module.exports = {
  entry,
  markPrinted,
  markError,
  refreshConfigured,
  probeAll,
  cicloDeSondagem,
  snapshot,
  anyOffline,
  printers,
};
