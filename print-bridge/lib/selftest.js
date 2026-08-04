"use strict";

// Diagnóstico completo em uma chamada. Serve a três donos:
//  · o instalador, que hoje aceita um UUID sintaticamente válido mas
//    inexistente e deixa a bridge subir muda;
//  · o auto-update, que precisa provar que o binário novo funciona ANTES de
//    trocar o que está no ar;
//  · o CI, que roda isto em windows-latest.

const fs = require("fs");
const path = require("path");

const { config } = require("./config");
const db = require("./db");

function fmt(ok, titulo, detalhe) {
  const marca = ok === true ? "OK  " : ok === false ? "FALHA" : "aviso";
  return `[${marca}] ${titulo}${detalhe ? ` — ${detalhe}` : ""}`;
}

async function comTimeout(promise, ms, mensagem) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error(mensagem)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns true se nada crítico falhou.
 */
async function runSelfTest({ identity, onLine, quiet = false } = {}) {
  const linhas = [];
  let critico = true;
  const diz = (ok, titulo, detalhe) => {
    const linha = fmt(ok, titulo, detalhe);
    linhas.push(linha);
    if (onLine) onLine(linha);
    if (!quiet) console.log(linha);
    if (ok === false) critico = false;
  };

  diz(true, "Versão", config.version);
  diz(
    !!config.tenantUserId,
    "Código do estabelecimento",
    config.tenantUserId || "NÃO configurado (a bridge imprimiria de qualquer estabelecimento)",
  );

  // Disco: sem ele o diário não protege contra reimpressão, mas a bridge sobe.
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const alvo = path.join(config.dataDir, ".escrita-teste");
    fs.writeFileSync(alvo, "ok");
    fs.unlinkSync(alvo);
    diz(true, "Pasta de dados gravável", config.dataDir);
  } catch (e) {
    diz(null, "Pasta de dados", `${config.dataDir} não é gravável (${e.message}) — sem proteção contra reimpressão`);
  }

  // REST: DNS, TLS, chave anônima.
  try {
    const t0 = Date.now();
    const { error } = await comTimeout(
      db.supabase.from("pdv_print_jobs").select("id", { count: "exact", head: true }).limit(1),
      10000,
      "sem resposta em 10s",
    );
    if (error) throw new Error(error.message);
    diz(true, "Conexão com o servidor Velara", `${Date.now() - t0}ms`);
  } catch (e) {
    diz(false, "Conexão com o servidor Velara", e.message);
  }

  // Centros configurados: é o que diz se o UUID digitado existe de verdade.
  if (config.tenantUserId) {
    try {
      let centros = await comTimeout(db.centers(), 10000, "sem resposta em 10s");
      if (centros === null) centros = await db.centersFromHistory();
      const nomes = (centros || []).map((c) => `${c.name || "?"} → ${c.printer_ip}`);
      diz(
        nomes.length > 0,
        "Impressoras cadastradas",
        nomes.length > 0
          ? nomes.join(" · ")
          : "nenhuma. Cadastre em Configurações → Centros de Produção, ou confira o código do estabelecimento",
      );
    } catch (e) {
      diz(false, "Impressoras cadastradas", e.message);
    }
  }

  // Heartbeat + relógio.
  if (identity && config.tenantUserId) {
    try {
      const enviado = Date.now();
      const r = await comTimeout(
        db.sync(identity, { version: config.version, hostname: require("os").hostname(), selftest: true }),
        10000,
        "sem resposta em 10s",
      );
      if (r?.server_time) {
        const rtt = Date.now() - enviado;
        const skew = Math.round(Date.now() - (Date.parse(r.server_time) + rtt / 2));
        diz(
          Math.abs(skew) <= 60000 ? true : null,
          "Relógio do computador",
          Math.abs(skew) <= 60000
            ? `${skew}ms de diferença`
            : `${Math.round(skew / 1000)}s fora do horário do servidor — corrija em Data e Hora`,
        );
      } else {
        diz(null, "Telemetria", "servidor ainda sem as funções da versão 2 (a impressão funciona igual)");
      }
    } catch (e) {
      diz(null, "Telemetria", e.message);
    }
  }

  // Realtime: opcional para imprimir (o reconciliador cobre), mas é o que dá
  // impressão em 2s em vez de 20s.
  try {
    const status = await comTimeout(
      new Promise((resolve) => {
        const ch = db.supabase
          .channel(`selftest-${Date.now()}`)
          .subscribe((s) => {
            if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
              db.supabase.removeChannel(ch).catch(() => {});
              resolve(s);
            }
          });
      }),
      15000,
      "não conectou em 15s",
    );
    diz(
      status === "SUBSCRIBED" ? true : null,
      "Impressão instantânea (Realtime)",
      status === "SUBSCRIBED" ? "conectado" : `${status} — a impressão ainda sai, com até 20s de atraso`,
    );
  } catch (e) {
    diz(null, "Impressão instantânea (Realtime)", `${e.message} — a impressão ainda sai, com até 20s de atraso`);
  }

  return critico;
}

module.exports = { runSelfTest };
