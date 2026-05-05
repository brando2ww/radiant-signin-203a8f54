require("dotenv").config();
const net = require("net");
const http = require("http");
const { createClient } = require("@supabase/supabase-js");

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  ESTABLISHMENT_NAME = "Estabelecimento",
  BRIDGE_HTTP_PORT = "7777",
  TENANT_USER_ID, // opcional: filtra reprocessamento on-boot por dono
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("✗ Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

// ─── Estado interno (para /health) ───────────────────────────────────────
const state = {
  subscription_status: "connecting",
  last_job_at: null,
  last_print_at: null,
  last_error: null,
  jobs_processed: 0,
  jobs_failed: 0,
  started_at: new Date().toISOString(),
};

// ─── Utilidades ──────────────────────────────────────────────────────────
const ts = () => new Date().toTimeString().slice(0, 8);
const log = (...args) => console.log(`[${ts()}]`, ...args);

const processedJobIds = new Set();
function markProcessed(id) {
  processedJobIds.add(id);
  if (processedJobIds.size > 5000) {
    const arr = [...processedJobIds];
    arr.slice(0, 2500).forEach((x) => processedJobIds.delete(x));
  }
}

// Fila por impressora (serializa conexões TCP para o mesmo IP:porta)
const printerQueues = new Map(); // key=ip:port -> { promise, depth }
const POST_PRINT_DELAY_MS = 300;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 3000]; // após attempt 1 espera 1s; após 2 espera 3s
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function enqueueForPrinter(key, taskFn) {
  const slot = printerQueues.get(key) || { promise: Promise.resolve(), depth: 0 };
  slot.depth += 1;
  const next = slot.promise
    .catch(() => {})
    .then(taskFn)
    .finally(async () => {
      await sleep(POST_PRINT_DELAY_MS);
      const cur = printerQueues.get(key);
      if (cur) {
        cur.depth -= 1;
        if (cur.depth <= 0 && cur.promise === next) {
          printerQueues.delete(key);
        }
      }
    });
  slot.promise = next;
  printerQueues.set(key, slot);
  return { promise: next, depth: slot.depth };
}

function normalizeIp(ip) {
  if (!ip || typeof ip !== "string") return ip;
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return parts.map((p) => String(parseInt(p, 10))).join(".");
}

// ─── ESC/POS ─────────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function stripAccents(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildReceipt({ mesa, comanda, subheader, body, centerName }) {
  const chunks = [];
  const push = (...bytes) => chunks.push(Buffer.from(bytes));
  const text = (s) => chunks.push(Buffer.from(stripAccents(s), "utf8"));
  const line = () => push(LF);

  push(ESC, 0x40);
  // Estabelecimento
  push(ESC, 0x61, 0x01);
  push(GS, 0x21, 0x11);
  text(ESTABLISHMENT_NAME);
  line();
  push(GS, 0x21, 0x00);
  text("================================");
  line();

  // MESA — destaque (largura+altura 4x)
  push(GS, 0x21, 0x33);
  text(String(mesa || "AVULSA").toUpperCase());
  line();

  // Comanda — destaque médio (2x)
  if (comanda) {
    push(GS, 0x21, 0x11);
    text(String(comanda));
    line();
  }
  push(GS, 0x21, 0x00);
  push(ESC, 0x61, 0x00);

  text("================================");
  line();
  (subheader || []).forEach((l) => {
    text(l);
    line();
  });
  text("--------------------------------");
  line();
  body.forEach((item, idx) => {
    if (idx > 0) {
      text("--------------------------------");
      line();
    }
    push(GS, 0x21, 0x01);
    text(`${item.quantity}x ${String(item.product_name).toUpperCase()}`);
    line();
    push(GS, 0x21, 0x00);
    if (item.parent_product_name) {
      text(`  (parte de: ${String(item.parent_product_name).toUpperCase()})`);
      line();
    }
    if (item.notes) {
      text(`  OBS: ${item.notes}`);
      line();
    }
    if (item.modifiers && typeof item.modifiers === "object") {
      const mods = Array.isArray(item.modifiers)
        ? item.modifiers
        : Object.values(item.modifiers);
      mods.flat().forEach((m) => {
        if (!m) return;
        const label = typeof m === "string" ? m : m.name || m.label || JSON.stringify(m);
        text(`  + ${label}`);
        line();
      });
    }
  });
  text("================================");
  line();
  if (centerName) {
    push(ESC, 0x61, 0x01);
    text(`>> ${centerName} <<`);
    line();
    push(ESC, 0x61, 0x00);
  }
  push(LF, LF, LF, LF);
  push(GS, 0x56, 0x41, 0x05);

  return Buffer.concat(chunks);
}

function sendToPrinter(ip, port, payload) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(5000);
    socket.once("timeout", () => finish(new Error("Timeout de conexão (5s)")));
    socket.once("error", (err) => finish(err));
    socket.connect(port, ip, () => {
      socket.write(payload, (err) => {
        if (err) return finish(err);
        setTimeout(() => finish(), 200);
      });
    });
  });
}

function formatDateTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Processamento de Job ────────────────────────────────────────────────
async function processJob(job) {
  if (!job || !job.id) return;
  if (processedJobIds.has(job.id)) return;
  markProcessed(job.id);

  state.last_job_at = new Date().toISOString();

  if (!job.printer_ip) {
    const msg = "sem impressora configurada";
    log(`⚠ Job ${job.id} (${job.payload?.product_name}) sem printer_ip — falhando`);
    await supabase
      .from("pdv_print_jobs")
      .update({ status: "failed", error_message: msg, attempts: (job.attempts || 0) + 1 })
      .eq("id", job.id);
    state.jobs_failed += 1;
    state.last_error = msg;
    return;
  }

  const ip = normalizeIp(job.printer_ip);
  const port = job.printer_port || 9100;
  const key = `${ip}:${port}`;
  const p = job.payload || {};
  const kind = p.kind || job.source_kind || "comanda";

  // Suporta dois formatos de payload:
  //  - novo: p.items = [{ product_name, quantity, notes, modifiers, parent_product_name, is_composite_child }, ...]
  //  - antigo (retrocompat): campos no topo
  const items = Array.isArray(p.items) && p.items.length > 0
    ? p.items
    : [{
        product_name: p.product_name,
        quantity: p.quantity,
        notes: p.notes,
        modifiers: p.modifiers,
        parent_product_name: p.parent_product_name,
        is_composite_child: p.is_composite_child,
      }];

  // Cabeçalho hierárquico: MESA destacada, comanda média
  const mesaRaw = p.mesa_numero
    ?? (p.table_number ? String(p.table_number) : null)
    ?? (kind === "order" ? (p.customer_name || "BALCÃO") : null)
    ?? "AVULSA";
  const mesa = kind === "delivery" || /^delivery$/i.test(String(mesaRaw))
    ? "DELIVERY"
    : (p.is_counter || /^balc[aã]o$/i.test(String(mesaRaw))
        ? "BALCÃO"
        : (/^mesa\b/i.test(String(mesaRaw)) ? String(mesaRaw) : `MESA ${mesaRaw}`));

  const comanda = p.comanda_nome
    || p.customer_name
    || (p.comanda_number ? `Comanda ${p.comanda_number}` : null)
    || (p.order_number ? `Pedido #${p.order_number}` : "");

  const subheader = [
    `Centro: ${job.center_name ?? "—"}`,
    kind === "order"
      ? `Pedido #${p.order_number}`
      : `Comanda #${p.comanda_number}`,
    formatDateTime(),
  ];
  if (items.length > 1) {
    subheader.push(`Itens: ${items.length}`);
  }

  const body = items.map((it) => ({
    product_name: it.product_name,
    quantity: it.quantity,
    notes: it.notes,
    modifiers: it.modifiers,
    parent_product_name: it.is_composite_child ? it.parent_product_name : null,
  }));

  const buf = buildReceipt({
    mesa,
    comanda,
    subheader,
    body,
    centerName: job.center_name,
  });

  const existing = printerQueues.get(key);
  if (existing && existing.depth > 0) {
    log(`⏳ Aguardando fila de ${ip} (${existing.depth} job(s) à frente) — job ${job.id}`);
  }

  const { promise } = enqueueForPrinter(key, async () => {
    const attemptNumber = (job.attempts || 0) + 1;
    await supabase
      .from("pdv_print_jobs")
      .update({ status: "printing", attempts: attemptNumber })
      .eq("id", job.id);

    const logSummary = items.length === 1
      ? `${items[0].quantity}x ${items[0].product_name}`
      : `${items.length} itens (${items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)} un)`;
    log(`→ Job ${job.id} | ${job.center_name} | ${logSummary} → ${ip}:${port} (tent. ${attemptNumber}/${MAX_ATTEMPTS})`);

    try {
      await sendToPrinter(ip, port, buf);
      await supabase
        .from("pdv_print_jobs")
        .update({ status: "printed", printed_at: new Date().toISOString(), error_message: null })
        .eq("id", job.id);
      state.jobs_processed += 1;
      state.last_print_at = new Date().toISOString();
      state.last_error = null;
      log(`✓ Impresso (${ip}) — job ${job.id}`);
    } catch (err) {
      const msg = err.message || String(err);
      state.last_error = msg;
      if (attemptNumber < MAX_ATTEMPTS) {
        const delay = RETRY_DELAYS_MS[attemptNumber - 1] || 3000;
        log(`🔁 Retry ${attemptNumber}/${MAX_ATTEMPTS} do job ${job.id} em ${delay}ms — ${msg}`);
        await supabase
          .from("pdv_print_jobs")
          .update({ status: "pending", error_message: `retry: ${msg}` })
          .eq("id", job.id);
        processedJobIds.delete(job.id);
        sleep(delay).then(() => {
          processJob({ ...job, attempts: attemptNumber }).catch((e) => log(`✗ retry processJob: ${e.message}`));
        });
      } else {
        await supabase
          .from("pdv_print_jobs")
          .update({ status: "failed", error_message: msg })
          .eq("id", job.id);
        state.jobs_failed += 1;
        log(`✗ Falha definitiva ${ip}:${port} — ${msg} (job ${job.id}, ${MAX_ATTEMPTS} tentativas)`);
      }
    }
  });

  await promise;
}

async function loadAndProcessJob(jobId) {
  const { data, error } = await supabase
    .from("pdv_print_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    log(`✗ Erro carregando job ${jobId}: ${error.message}`);
    return;
  }
  if (!data) {
    log(`⚠ Job ${jobId} não encontrado`);
    return;
  }
  await processJob(data);
}

// ─── Reprocessamento on-boot ─────────────────────────────────────────────
async function reprocessPending() {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  let q = supabase
    .from("pdv_print_jobs")
    .select("*")
    .eq("status", "pending")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(200);
  if (TENANT_USER_ID) q = q.eq("tenant_user_id", TENANT_USER_ID);

  const { data, error } = await q;
  if (error) {
    log(`✗ Reprocessamento: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    log(`✓ Nenhum job pendente nas últimas 2h`);
    return;
  }
  log(`⟳ Reprocessando ${data.length} job(s) pendente(s)...`);
  for (const job of data) {
    await processJob(job);
  }
}

// ─── Realtime com reconexão ──────────────────────────────────────────────
let currentChannel = null;
let reconnectDelay = 30000;
const MAX_DELAY = 5 * 60 * 1000;

function scheduleReconnect() {
  log(`⟳ Reconectando em ${Math.round(reconnectDelay / 1000)}s...`);
  setTimeout(() => {
    reconnectDelay = Math.min(Math.round(reconnectDelay * 1.5), MAX_DELAY);
    connectRealtime();
  }, reconnectDelay);
}

function connectRealtime() {
  if (currentChannel) {
    supabase.removeChannel(currentChannel).catch(() => {});
    currentChannel = null;
  }
  const name = `print-bridge-${Date.now()}`;
  log(`→ Conectando Realtime (${name}) — escutando pdv_print_jobs...`);
  state.subscription_status = "connecting";

  const channel = supabase
    .channel(name)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "pdv_print_jobs" },
      (payload) => {
        const job = payload?.new;
        if (!job || job.status !== "pending") return;
        log(`📥 Novo job ${job.id} (${job.payload?.product_name}) status=${job.status}`);
        processJob(job).catch((e) => log(`✗ processJob: ${e.message}`));
      },
    )
    .subscribe((status, err) => {
      state.subscription_status = status;
      if (status === "SUBSCRIBED") {
        reconnectDelay = 30000;
        log(`✓ Realtime conectado. Ouvindo INSERT em pdv_print_jobs.`);
        // Após reconectar, reprocessa pendentes
        reprocessPending().catch((e) => log(`✗ reprocessPending: ${e.message}`));
      } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
        log(`✗ Realtime ${status}${err ? `: ${err.message}` : ""}`);
        scheduleReconnect();
      }
    });
  currentChannel = channel;
}

// ─── HTTP server local ───────────────────────────────────────────────────
async function getPendingCount() {
  let q = supabase
    .from("pdv_print_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (TENANT_USER_ID) q = q.eq("tenant_user_id", TENANT_USER_ID);
  const { count, error } = await q;
  if (error) return null;
  return count ?? 0;
}

function startHttpServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "GET" && req.url === "/health") {
      getPendingCount().then((pending) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "ok",
          establishment: ESTABLISHMENT_NAME,
          subscription_status: state.subscription_status,
          last_job_at: state.last_job_at,
          last_print_at: state.last_print_at,
          last_error: state.last_error,
          jobs_processed: state.jobs_processed,
          jobs_failed: state.jobs_failed,
          pending_jobs_count: pending,
          started_at: state.started_at,
        }));
      });
      return;
    }

    if (req.method === "POST" && req.url === "/reprint") {
      let buf = "";
      req.on("data", (chunk) => (buf += chunk));
      req.on("end", async () => {
        try {
          const body = JSON.parse(buf || "{}");
          const { jobId, itemId, kind = "comanda" } = body;

          if (jobId) {
            // Reenfileira job existente
            await supabase
              .from("pdv_print_jobs")
              .update({ status: "pending", error_message: null })
              .eq("id", jobId);
            processedJobIds.delete(jobId);
            await loadAndProcessJob(jobId);
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ok: true, jobId }));
          }

          if (itemId) {
            // Compatibilidade: cria/processa job buscando o último com aquele source_item_id
            const { data } = await supabase
              .from("pdv_print_jobs")
              .select("*")
              .eq("source_item_id", itemId)
              .eq("source_kind", kind)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!data) {
              res.writeHead(404, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ ok: false, error: "Nenhum job encontrado para esse itemId" }));
            }
            await supabase
              .from("pdv_print_jobs")
              .update({ status: "pending", error_message: null })
              .eq("id", data.id);
            processedJobIds.delete(data.id);
            await loadAndProcessJob(data.id);
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ok: true, jobId: data.id }));
          }

          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "jobId ou itemId obrigatório" }));
        } catch (err) {
          log(`✗ Reprint falhou: ${err.message}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/test-print") {
      let buf = "";
      req.on("data", (chunk) => (buf += chunk));
      req.on("end", async () => {
        try {
          const { ip, port = 9100, centerName = "Teste" } = JSON.parse(buf || "{}");
          if (!ip) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ok: false, error: "IP obrigatório" }));
          }
          const payload = buildReceipt({
            mesa: "TESTE",
            comanda: "Print Bridge",
            subheader: ["Centro: " + centerName, "*** TESTE DE IMPRESSÃO ***", formatDateTime()],
            body: [{ product_name: "Print Bridge OK", quantity: 1 }],
            centerName,
          });
          await sendToPrinter(normalizeIp(ip), port, payload);
          log(`✓ Teste impresso em ${ip}:${port}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          log(`✗ Teste falhou: ${err.message}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });
  server.listen(Number(BRIDGE_HTTP_PORT), "127.0.0.1", () => {
    log(`HTTP local em http://localhost:${BRIDGE_HTTP_PORT} (health, test-print, reprint)`);
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────
log(`=== Velara Print Bridge — ${ESTABLISHMENT_NAME} ===`);
if (TENANT_USER_ID) log(`Filtro de tenant: ${TENANT_USER_ID}`);
startHttpServer();
connectRealtime();

process.on("uncaughtException", (err) => log(`✗ uncaught: ${err.message}`));
process.on("unhandledRejection", (err) => log(`✗ unhandled: ${err}`));
