"use strict";

// Velara Print Bridge — serviço local que imprime os cupons do PDV.
//
// Este arquivo é só orquestração e HTTP. A lógica vive em lib/:
//   config.js      configuração, identidade da instalação, versão
//   receipts.js    ESC/POS puro (testável sem impressora)
//   printer-io.js  TCP 9100, serial e roteamento
//   win-spool.js   impressora do Windows, assíncrona
//   queue.js       fila por impressora, timeout e quarentena
//   journal.js     diário durável: garante que um cupom não sai duas vezes
//   db.js          Supabase (RPCs da v2 com queda para o caminho antigo)
//   worker.js      execução de um job
//   reconciler.js  polling + Realtime com watchdog
//   heartbeat.js   telemetria no banco
//   printers.js    estado por impressora

require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const { config, loadIdentity, loadPanelToken } = require("./lib/config");
const { log, tail } = require("./lib/log");

// ─── Linha de comando ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--version") || argv.includes("-v")) {
  console.log(config.version);
  process.exit(0);
}

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  console.error("✗ Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env");
  process.exit(1);
}

const db = require("./lib/db");
const io = require("./lib/printer-io");
const queue = require("./lib/queue");
const journal = require("./lib/journal");
const printers = require("./lib/printers");
const receipts = require("./lib/receipts");
const worker = require("./lib/worker");
const reconciler = require("./lib/reconciler");
const heartbeat = require("./lib/heartbeat");
const winSpool = require("./lib/win-spool");
const { runSelfTest } = require("./lib/selftest");

const identity = loadIdentity();
const panelToken = loadPanelToken();
worker.setIdentity(identity);

if (argv.includes("--selftest")) {
  runSelfTest({ identity })
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((e) => {
      console.error("✗ selftest:", e.message);
      process.exit(1);
    });
  return;
}

// ─── HTTP local ──────────────────────────────────────────────────────────
// O painel roda em 127.0.0.1. A liberação de origem deixou de ser "*": com
// PNA habilitado, qualquer página aberta no navegador do caixa conseguia
// disparar impressão e reimpressão.
const ORIGENS_PERMITIDAS = [
  "https://pdv.velaraia.app",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
];

function aplicarCors(req, res) {
  const origem = req.headers.origin;
  if (origem && ORIGENS_PERMITIDAS.includes(origem)) {
    res.setHeader("Access-Control-Allow-Origin", origem);
    res.setHeader("Vary", "Origin");
    // Private Network Access: sem este cabeçalho no preflight, o Chrome derruba
    // a chamada do painel web para o localhost antes de ela sair do navegador.
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function autorizado(req) {
  const t = req.headers["x-bridge-token"];
  return typeof t === "string" && t.length > 0 && t === panelToken;
}

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(buf || "{}"));
      } catch (_) {
        resolve({});
      }
    });
  });
}

async function montarStatus() {
  const [pending, stuck] = await Promise.all([db.countPending(true), db.countPending(false)]);
  const saudavel = reconciler.saudavel();
  return {
    version: config.version,
    establishment: config.establishmentName,
    // "connected" é lido pelo tray e pelo painel. Passa a significar saúde
    // real (trabalhou ou conferiu a fila há pouco), não "o socket diz que
    // está inscrito" — que ficava verde durante quedas inteiras.
    connected: saudavel,
    healthy: saudavel,
    realtime_ok: reconciler.rt.status === "SUBSCRIBED",
    subscription_status: reconciler.rt.status,
    realtime_last_event_at: reconciler.rt.lastEventAt,
    poll_last_ok_at: worker.state.last_reconcile_ok_at,
    started_at: worker.state.started_at,
    last_print_at: worker.state.last_print_at,
    last_error: worker.state.last_error,
    jobs_processed: worker.state.jobs_processed,
    jobs_failed: worker.state.jobs_failed,
    pending_jobs_count: pending,
    stuck_jobs_count: stuck,
    clock_skew_ms: heartbeat.estadoRemoto.clock_skew_ms,
    journal_ok: journal.available,
    pending_confirms: journal.pendingConfirms().length,
    install_id: identity.install_id,
    printers: printers.snapshot(),
    log: tail(120),
  };
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    aplicarCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const url = (req.url || "").split("?")[0];

    try {
      // Painel. O pkg embute panel.html como asset, então o caminho vale tanto
      // rodando por node quanto dentro do .exe.
      if (req.method === "GET" && (url === "/" || url === "/index.html")) {
        try {
          let html = fs.readFileSync(path.join(__dirname, "panel.html"), "utf8");
          // O painel é servido pela própria bridge, então recebe o token
          // injetado: same-origin, sem atrito para o operador.
          html = html.replace("__BRIDGE_TOKEN__", panelToken);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          return res.end(html);
        } catch (e) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("Painel indisponivel: " + e.message);
        }
      }

      if (req.method === "GET" && url === "/status") {
        return json(res, 200, await montarStatus());
      }

      if (req.method === "GET" && url === "/health") {
        const pending = await db.countPending(true);
        return json(res, 200, {
          status: reconciler.saudavel() ? "ok" : "degradado",
          establishment: config.establishmentName,
          version: config.version,
          install_id: identity.install_id,
          subscription_status: reconciler.rt.status,
          poll_last_ok_at: worker.state.last_reconcile_ok_at,
          last_job_at: worker.state.last_job_at,
          last_print_at: worker.state.last_print_at,
          last_error: worker.state.last_error,
          jobs_processed: worker.state.jobs_processed,
          jobs_failed: worker.state.jobs_failed,
          pending_jobs_count: pending,
          clock_skew_ms: heartbeat.estadoRemoto.clock_skew_ms,
          started_at: worker.state.started_at,
        });
      }

      if (req.method === "GET" && url === "/stuck") {
        return json(res, 200, { jobs: await db.listStuck() });
      }

      if (req.method === "GET" && url === "/list-printers") {
        try {
          return json(res, 200, await winSpool.listAvailablePrinters());
        } catch (e) {
          return json(res, 200, { com_ports: [], windows_printers: [], error: e.message });
        }
      }

      if (req.method === "GET" && url === "/selftest") {
        const linhas = [];
        const ok = await runSelfTest({ identity, onLine: (l) => linhas.push(l), quiet: true });
        // O instalador consome a versão em texto: montar JSON em Pascal seria
        // pedir para errar.
        if ((req.url || "").includes("formato=texto")) {
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end(linhas.join("\r\n") + `\r\n\r\n${ok ? "TUDO CERTO" : "HA PROBLEMAS"}\r\n`);
        }
        return json(res, 200, { ok, checks: linhas });
      }

      // ── daqui para baixo, exige token ──────────────────────────────────
      if (req.method === "POST" && (url === "/reprint" || url === "/test-print")) {
        if (!autorizado(req)) {
          return json(res, 401, { ok: false, error: "token da bridge ausente ou inválido" });
        }
        const body = await lerCorpo(req);

        if (url === "/reprint") {
          try {
            let jobId = body.jobId;
            if (!jobId && body.itemId) {
              const { data } = await db.supabase
                .from("pdv_print_jobs")
                .select("id")
                .eq("source_item_id", body.itemId)
                .eq("source_kind", body.kind || "comanda")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (!data) return json(res, 404, { ok: false, error: "nenhum job para esse itemId" });
              jobId = data.id;
            }
            if (!jobId) return json(res, 400, { ok: false, error: "jobId ou itemId obrigatório" });
            await worker.reprint(jobId);
            return json(res, 200, { ok: true, jobId });
          } catch (e) {
            log(`✗ Reimpressão falhou: ${e.message}`);
            return json(res, 200, { ok: false, error: e.message });
          }
        }

        // /test-print
        try {
          const { ip, port = 9100, printerName, centerName = "Teste" } = body;
          const alvo = printerName || ip;
          if (!alvo) return json(res, 400, { ok: false, error: "IP ou printerName obrigatório" });

          const buf = receipts.buildReceipt({
            mesa: "TESTE",
            comanda: "Print Bridge",
            subheader: [`Centro: ${centerName}`, "*** TESTE DE IMPRESSAO ***", receipts.formatDateTime()],
            body: [{ product_name: `Print Bridge ${config.version} OK`, quantity: 1 }],
            centerName,
            establishmentName: config.establishmentName,
          });
          const alvoJob = { printer_ip: alvo, printer_port: port };
          // Pela fila, e não direto: um teste disparado no meio de um cupom
          // intercalaria bytes na mesma impressora.
          await queue.enqueue(io.queueKey(alvoJob), ({ signal }) =>
            io.routePrint(alvoJob, buf, { signal }),
          ).promise;
          log(`✓ Teste impresso em [${alvo}]`);
          return json(res, 200, { ok: true });
        } catch (e) {
          log(`✗ Teste falhou: ${e.message}`);
          return json(res, 200, { ok: false, error: e.message });
        }
      }

      res.writeHead(404);
      res.end();
    } catch (e) {
      log(`✗ HTTP ${url}: ${e.message}`);
      if (!res.headersSent) json(res, 500, { ok: false, error: e.message });
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      log(`✗ Porta ${config.httpPort} já em uso — outra instância da bridge está rodando. Encerrando.`);
      process.exit(1);
    }
    log(`✗ Erro no servidor HTTP: ${err.message}`);
  });

  server.listen(config.httpPort, "127.0.0.1", () => {
    log(`HTTP local em http://localhost:${config.httpPort}/`);
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────
log(`=== Velara Print Bridge ${config.version} — ${config.establishmentName} ===`);
log(`PID ${process.pid} | porta ${config.httpPort} | instalação ${identity.install_id}`);
if (config.tenantUserId) log(`Estabelecimento: ${config.tenantUserId}`);
else log("⚠ TENANT_USER_ID não configurado — sem filtro de estabelecimento");
log(`Dados em ${config.dataDir}`);
log(`Painel: http://localhost:${config.httpPort}/`);

journal.init();
startHttpServer();

printers.cicloDeSondagem();
const sondagem = setInterval(() => printers.cicloDeSondagem(), config.probeIntervalMs);
sondagem.unref?.();

reconciler.start();
heartbeat.start(identity, panelToken);

setInterval(() => journal.compact(), 6 * 60 * 60 * 1000).unref?.();

process.on("uncaughtException", (err) => log(`✗ uncaught: ${err.stack || err.message}`));
process.on("unhandledRejection", (err) => log(`✗ unhandled: ${err}`));
process.on("SIGTERM", () => {
  log("Encerrando (SIGTERM)...");
  reconciler.stop();
  heartbeat.stop();
  process.exit(0);
});
