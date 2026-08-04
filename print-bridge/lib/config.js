"use strict";

// Configuração e identidade da instalação.
//
// A versão passa a ter UMA fonte: package.json. Antes conviviam três números
// (server.js 1.5.0, package.json 1.1.0, instalador 1.4.1) e ninguém sabia o que
// estava rodando no cliente.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const pkg = require("../package.json");

const env = process.env;

const num = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const bool = (v, def) => {
  if (v === undefined || v === "") return def;
  return v !== "0" && String(v).toLowerCase() !== "false";
};

/**
 * Onde guardamos journal e identidade. Precisa sobreviver a reinstalação e ser
 * gravável pela conta SYSTEM (o serviço não roda como o usuário logado), por
 * isso ProgramData e não a pasta do programa nem o perfil do usuário.
 */
function resolveDataDir() {
  if (env.BRIDGE_DATA_DIR) return env.BRIDGE_DATA_DIR;
  if (process.platform === "win32") {
    return path.join(env.ProgramData || "C:\\ProgramData", "Velara", "PrintBridge");
  }
  return path.join(os.homedir(), ".velara-print-bridge");
}

const config = {
  version: pkg.version,

  supabaseUrl: env.SUPABASE_URL,
  supabaseAnonKey: env.SUPABASE_ANON_KEY,
  establishmentName: env.ESTABLISHMENT_NAME || "Estabelecimento",
  tenantUserId: env.TENANT_USER_ID || null,
  httpPort: num(env.BRIDGE_HTTP_PORT, 7777),

  dataDir: resolveDataDir(),

  // ── Reconciliação ──────────────────────────────────────────────────────
  // O polling é o caminho que não pode falhar; o Realtime só adianta a latência.
  reconcileIntervalMs: num(env.RECONCILE_INTERVAL_MS, 20000),
  // Janela de impressão automática. Deliberadamente curta: sem ela, a primeira
  // subida da v2 despejaria na cozinha cupons de pedidos entregues dias atrás
  // (há pendentes de 22/07 no KOTEN e de 02/08 no La Vecchia).
  reconcileMaxAgeMin: num(env.RECONCILE_MAX_AGE_MIN, 180),
  reconcileBatch: num(env.RECONCILE_BATCH, 10),
  leaseSeconds: num(env.LEASE_SECONDS, 120),
  maxAttempts: num(env.MAX_ATTEMPTS, 3),
  // Teto no banco: acima disso o job não é mais reivindicado por ninguém.
  hardMaxAttempts: num(env.HARD_MAX_ATTEMPTS, 6),

  // ── Filas e impressão ──────────────────────────────────────────────────
  jobTimeoutMs: num(env.JOB_TIMEOUT_MS, 45000),
  maxQueueDepth: num(env.MAX_QUEUE_DEPTH, 20),
  postPrintDelayMs: num(env.POST_PRINT_DELAY_MS, 300),
  retryDelaysMs: [1000, 3000],
  tcpTimeoutMs: num(env.TCP_TIMEOUT_MS, 5000),
  serialTimeoutMs: num(env.SERIAL_TIMEOUT_MS, 10000),
  // Consulta de status ESC/POS (DLE EOT) antes e depois de imprimir em rede.
  // Degrada para "desconhecido" e imprime assim mesmo se a impressora não
  // responder: muito clone não implementa o comando.
  tcpStatusCheck: bool(env.TCP_STATUS_CHECK, true),
  tcpStatusTimeoutMs: num(env.TCP_STATUS_TIMEOUT_MS, 800),

  // Quarentena por impressora: 3 falhas seguidas e ela para de receber jobs
  // por um tempo crescente, enquanto as outras seguem imprimindo.
  breakerThreshold: num(env.BREAKER_THRESHOLD, 3),
  breakerBackoffMs: [30000, 60000, 120000, 300000],

  // ── Windows ────────────────────────────────────────────────────────────
  spoolVerify: bool(env.WINDOWS_SPOOL_VERIFY, true),
  spoolTimeoutMs: Math.max(3000, num(env.WINDOWS_SPOOL_TIMEOUT_MS, 15000)),
  probeIntervalMs: num(env.PROBE_INTERVAL_MS, 60000),

  // ── Heartbeat ──────────────────────────────────────────────────────────
  heartbeatIntervalMs: num(env.HEARTBEAT_INTERVAL_MS, 30000),

  // ── Teste ──────────────────────────────────────────────────────────────
  // Ver tools/. Nada disso deve estar ligado em cliente.
  fakeWindows: bool(env.BRIDGE_FAKE_WINDOWS, false),
  chaosFailConfirm: num(env.CHAOS_FAIL_CONFIRM, 0),
};

/**
 * Identidade estável da instalação, para heartbeat e para saber de quem é o
 * job reivindicado (`claimed_by`). Gerada no primeiro boot e reusada sempre.
 */
function loadIdentity() {
  const file = path.join(config.dataDir, "install.json");
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved && saved.install_id && saved.secret) return saved;
  } catch (_) {
    // primeira vez, ou arquivo corrompido: gera de novo
  }
  const fresh = {
    install_id: crypto.randomUUID(),
    secret: crypto.randomBytes(24).toString("hex"),
    created_at: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(fresh, null, 2));
  } catch (_) {
    // Sem disco gravável seguimos em memória: heartbeat vira ruído (um
    // install_id novo a cada boot), mas impressão não pode parar por isso.
  }
  return fresh;
}

/** Token do painel: exigido por /test-print e /reprint. */
function loadPanelToken() {
  if (env.BRIDGE_TOKEN) return env.BRIDGE_TOKEN;
  const file = path.join(config.dataDir, "panel-token");
  try {
    const t = fs.readFileSync(file, "utf8").trim();
    if (t) return t;
  } catch (_) {}
  const t = crypto.randomBytes(16).toString("hex");
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file, t);
  } catch (_) {}
  return t;
}

module.exports = { config, loadIdentity, loadPanelToken };
