"use strict";

// Diário durável de impressões. É o que torna "imprimiu uma vez" um fato do
// disco local, e não uma dedução do estado do banco.
//
// O bug que ele fecha: routePrint tinha sucesso, o UPDATE para `printed`
// falhava (queda de internet), o erro caía no mesmo catch de "falha ao
// imprimir" e o job entrava em retry — o cupom saía duas vezes. Foi essa
// classe de bug que causou a duplicação de comandas de junho.
//
// Regra: gravamos `printed` no disco ANTES de tentar o banco. Se o banco
// falhar, nunca reimprimimos; um confirmador de fundo insiste até conseguir.
// E antes de imprimir qualquer job (inclusive órfão recuperado por lease)
// perguntamos ao diário se ele já saiu.

const fs = require("fs");
const path = require("path");

const { config } = require("./config");
const { log } = require("./log");

const RETENCAO_MS = 48 * 60 * 60 * 1000; // impressões
const RETENCAO_CONFIRMADO_MS = 60 * 60 * 1000; // já confirmadas no banco

const file = path.join(config.dataDir, "journal.jsonl");

/** jobId → { printed_at, confirmed_at } */
const entries = new Map();
let available = false;
let fd = null;

function open() {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fd = fs.openSync(file, "a");
    available = true;
  } catch (e) {
    // Sem diário a bridge SOBE do mesmo jeito. Perder a garantia de
    // exatamente-uma-vez é ruim; não imprimir é pior.
    available = false;
    log(`⚠ Diário indisponível em ${file} (${e.message}) — seguindo sem proteção contra reimpressão`);
  }
}

function load() {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (_) {
    return; // primeira execução
  }
  const limite = Date.now() - RETENCAO_MS;
  for (const linha of raw.split("\n")) {
    if (!linha.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(linha);
    } catch (_) {
      continue; // linha truncada por queda de energia no meio do append
    }
    if (!rec.id) continue;
    const at = Date.parse(rec.at || "") || 0;
    if (at && at < limite) continue;
    const cur = entries.get(rec.id) || {};
    if (rec.ev === "forget") {
      entries.delete(rec.id);
      continue;
    }
    if (rec.ev === "printed") cur.printed_at = rec.at;
    if (rec.ev === "confirmed") cur.confirmed_at = rec.at;
    entries.set(rec.id, cur);
  }
}

function append(rec, sync) {
  if (!available) return;
  try {
    const linha = JSON.stringify(rec) + "\n";
    fs.writeSync(fd, linha);
    // fsync só no `printed`: é o único evento cuja perda causa reimpressão.
    // São ~80 bytes, sub-milissegundo, e é o preço da corretude.
    if (sync) fs.fsyncSync(fd);
  } catch (e) {
    log(`⚠ Falha ao gravar no diário: ${e.message}`);
  }
}

function init() {
  load();
  open();
  const pend = pendingConfirms().length;
  log(`Diário: ${entries.size} registro(s) recente(s)${pend ? `, ${pend} aguardando confirmação no banco` : ""}`);
  compact();
}

/** Este job já saiu na impressora? */
function hasPrinted(jobId) {
  return entries.has(jobId) && !!entries.get(jobId).printed_at;
}

function markPrinted(jobId) {
  const at = new Date().toISOString();
  const cur = entries.get(jobId) || {};
  cur.printed_at = at;
  entries.set(jobId, cur);
  append({ id: jobId, ev: "printed", at }, true);
}

function markConfirmed(jobId) {
  const at = new Date().toISOString();
  const cur = entries.get(jobId) || {};
  cur.confirmed_at = at;
  entries.set(jobId, cur);
  append({ id: jobId, ev: "confirmed", at }, false);
}

/**
 * Esquece um job. Só a reimpressão manual usa isto: ali a repetição é
 * exatamente o que o operador pediu, então a proteção precisa sair da frente.
 */
function forget(jobId) {
  entries.delete(jobId);
  append({ id: jobId, ev: "forget", at: new Date().toISOString() }, false);
}

/** Impresso no papel, mas o banco ainda não sabe. */
function pendingConfirms() {
  const out = [];
  for (const [id, e] of entries) {
    if (e.printed_at && !e.confirmed_at) out.push(id);
  }
  return out;
}

/** Reescreve o arquivo mantendo só o que ainda importa. */
function compact() {
  if (!available) return;
  const agora = Date.now();
  const manter = [];
  for (const [id, e] of entries) {
    const at = Date.parse(e.printed_at || "") || 0;
    const conf = Date.parse(e.confirmed_at || "") || 0;
    if (conf && agora - conf > RETENCAO_CONFIRMADO_MS) {
      entries.delete(id);
      continue;
    }
    if (at && agora - at > RETENCAO_MS) {
      entries.delete(id);
      continue;
    }
    manter.push({ id, ev: "printed", at: e.printed_at });
    if (e.confirmed_at) manter.push({ id, ev: "confirmed", at: e.confirmed_at });
  }
  try {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, manter.map((r) => JSON.stringify(r)).join("\n") + (manter.length ? "\n" : ""));
    if (fd !== null) fs.closeSync(fd);
    fs.renameSync(tmp, file);
    fd = fs.openSync(file, "a");
  } catch (e) {
    log(`⚠ Falha ao compactar o diário: ${e.message}`);
    try { fd = fs.openSync(file, "a"); } catch (_) { available = false; }
  }
}

module.exports = {
  init,
  hasPrinted,
  markPrinted,
  markConfirmed,
  forget,
  pendingConfirms,
  compact,
  get available() {
    return available;
  },
  get size() {
    return entries.size;
  },
};
