require("dotenv").config();
const ws = require("ws");
const net = require("net");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
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
  realtime: { params: { eventsPerSecond: 10 }, transport: ws },
});

// ─── Estado interno (para /health) ───────────────────────────────────────
const VERSION = "1.3.0";

const state = {
  subscription_status: "connecting",
  last_job_at: null,
  last_print_at: null,
  last_error: null,
  jobs_processed: 0,
  jobs_failed: 0,
  started_at: new Date().toISOString(),
};

// Status por impressora, alimentado a cada impressão e pela sondagem
// periódica. Antes só existia o estado global, que não dizia QUAL bancada
// estava fora — e foi exatamente isso que fez a falha do KOTEN passar dois
// dias despercebida.
const printers = new Map(); // chave: alvo (ip ou nome Windows)

function printerEntry(target) {
  if (!printers.has(target)) {
    printers.set(target, {
      target,
      centers: new Set(),
      online: null, // null = ainda não sondada
      last_print_at: null,
      last_error: null,
      last_error_at: null,
      checked_at: null,
    });
  }
  return printers.get(target);
}

// ─── Utilidades ──────────────────────────────────────────────────────────
const ts = () => new Date().toTimeString().slice(0, 8);

// Anel dos últimos eventos, para a aba "Detalhes" do painel. Sem isto o
// cliente precisaria abrir arquivo em Program Files para contar o que houve.
const LOG_MAX = 300;
const logRing = [];
const log = (...args) => {
  const msg = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  logRing.push({ at: new Date().toISOString(), msg });
  if (logRing.length > LOG_MAX) logRing.shift();
  console.log(`[${ts()}]`, ...args);
};

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
    // Rótulo do grupo de composição (ex.: "Etapa 1") logo antes do filho
    if (item.composition_group_label) {
      push(GS, 0x21, 0x00);
      text(`[${String(item.composition_group_label).toUpperCase()}]`);
      line();
    }
    push(GS, 0x21, 0x01);
    text(`${item.quantity}x ${String(item.product_name).toUpperCase()}`);
    line();
    push(GS, 0x21, 0x00);
    if (!item.composition_group_label && item.parent_product_name) {
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

function buildCaixaReceipt(p) {
  const chunks = [];
  const push = (...bytes) => chunks.push(Buffer.from(bytes));
  const text = (s) => chunks.push(Buffer.from(stripAccents(String(s || "")), "utf8"));
  const line = () => push(LF);
  const divider = (c = "=") => { text(c.repeat(32)); line(); };
  const fmtBRL = (v) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
  const padRow = (label, val, bold) => {
    const l = stripAccents(String(label)).slice(0, 20);
    const r = String(val).slice(-12);
    if (bold) push(GS, 0x21, 0x01);
    text(l.padEnd(20) + r.padStart(12));
    line();
    if (bold) push(GS, 0x21, 0x00);
  };

  push(ESC, 0x40);
  push(ESC, 0x61, 0x01);
  push(GS, 0x21, 0x11);
  text("COMANDA CAIXA");
  line();
  push(GS, 0x21, 0x00);
  divider();

  push(ESC, 0x61, 0x00);
  const ticketStr = p.ticket_number != null ? `T#${String(p.ticket_number).padStart(3, "0")}` : null;
  const orderStr = p.order_number ? `Pedido #${p.order_number}` : null;
  text([orderStr, ticketStr].filter(Boolean).join("  ") || "Pedido");
  line();
  text(formatDateTime());
  line();

  // Entrega ou retirada em destaque: e a primeira coisa que o caixa precisa
  // saber, e antes so dava para deduzir pela presenca do endereco.
  push(ESC, 0x61, 0x01);
  push(GS, 0x21, 0x01);
  text(p.order_type === "pickup" ? ">> RETIRADA NO LOCAL <<" : ">> ENTREGA <<");
  line();
  push(GS, 0x21, 0x00);
  push(ESC, 0x61, 0x00);
  divider("-");

  if (p.customer_name) {
    push(GS, 0x21, 0x01);
    text(p.customer_name);
    line();
    push(GS, 0x21, 0x00);
    if (p.customer_phone) { text(p.customer_phone); line(); }
  }

  if (p.order_type !== "pickup" && p.delivery_address) {
    divider("-");
    text("ENDERECO:");
    line();
    push(GS, 0x21, 0x01);
    text(p.delivery_address);
    line();
    push(GS, 0x21, 0x00);
    if (p.delivery_complement) { text("Compl.: " + p.delivery_complement); line(); }
    if (p.delivery_reference) { text("Ref.: " + p.delivery_reference); line(); }
  }

  if (p.notes) { divider("-"); text("OBS: " + p.notes); line(); }

  divider("-");
  const items = Array.isArray(p.items) ? p.items : [];
  text(`ITENS (${items.length}):`);
  line();
  items.forEach((it) => {
    push(GS, 0x21, 0x01);
    text(`${it.quantity}x ${String(it.product_name || "").toUpperCase()}`);
    line();
    push(GS, 0x21, 0x00);
    if (it.notes) { text(`  OBS: ${it.notes}`); line(); }
    (Array.isArray(it.modifiers) ? it.modifiers : []).forEach((m) => {
      const lbl = typeof m === "string" ? m : (m && (m.name || m.label)) || "";
      if (lbl) { text(`  + ${lbl}`); line(); }
    });
  });

  divider("=");
  if (p.subtotal != null) padRow("Subtotal:", fmtBRL(p.subtotal));
  if (Number(p.delivery_fee) > 0) padRow("Taxa de entrega:", fmtBRL(p.delivery_fee));
  if (Number(p.discount_amount) > 0) padRow("Desconto:", "-" + fmtBRL(p.discount_amount));
  padRow("TOTAL:", fmtBRL(p.total), true);

  divider("-");
  // O banco grava em ingles (cash/credit/debit/pix). O mapa antigo so conhecia
  // os termos em portugues, entao o cupom saia com "Pagamento: cash".
  const PM = {
    pix: "PIX",
    cash: "Dinheiro", dinheiro: "Dinheiro", money: "Dinheiro",
    credit: "Cartao de credito", credito: "Cartao de credito",
    credit_card: "Cartao de credito",
    debit: "Cartao de debito", debito: "Cartao de debito",
    debit_card: "Cartao de debito",
    cartao: "Cartao", card: "Cartao",
    voucher: "Vale-refeicao", vale_refeicao: "Vale-refeicao",
    online: "Online (ja pago)",
  };
  const pm = PM[String(p.payment_method || "").toLowerCase()] || p.payment_method || "N/D";
  const paid = p.payment_status === "paid" ? "PAGO" : "A RECEBER";
  push(GS, 0x21, 0x01);
  text(`Pagamento: ${pm}`);
  line();
  push(GS, 0x21, 0x00);
  text(`Situacao: ${paid}`);
  line();
  // "Troco para" e o valor que o cliente vai entregar, nao o troco em si.
  if (Number(p.change_amount) > 0) {
    text(`Troco para: ${fmtBRL(p.change_amount)}`);
    line();
    const troco = Number(p.change_amount) - Number(p.total || 0);
    if (troco > 0) { text(`Levar de troco: ${fmtBRL(troco)}`); line(); }
  }

  divider("=");
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

// Porta serial (COM1-COM256) ou paralela (LPT1-LPT9) — Node.js puro, sem lib externa
function sendToSerialPort(portName, buffer) {
  return new Promise((resolve, reject) => {
    const devPath = process.platform === "win32"
      ? `\\\\.\\${portName.toUpperCase()}`
      : `/dev/${portName}`; // fallback Linux: /dev/ttyUSB0
    const stream = fs.createWriteStream(devPath, { flags: "a" });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      stream.destroy();
      err ? reject(err) : resolve();
    };
    stream.once("error", finish);
    stream.write(buffer, (err) => {
      if (err) return finish(err);
      stream.end(finish);
    });
  });
}

// Impressora registrada no Windows (USB com driver, impressora compartilhada, etc.)
// Usa Win32 API via PowerShell Add-Type + P/Invoke — sem dependências extras
const PS_RAWPRINT_TYPE = `
using System; using System.Runtime.InteropServices;
public class VelaraRawPrint {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Ansi)]
  public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv",SetLastError=true)] static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)] static extern int StartDocPrinter(IntPtr h,int l,ref DOCINFO i);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)] static extern bool WritePrinter(IntPtr h,byte[] b,int n,out int w);
  public static void Send(string p,byte[] b){
    IntPtr h; if(!OpenPrinter(p,out h,IntPtr.Zero)) throw new Exception("Impressora nao encontrada: "+p);
    try {
      var d=new DOCINFO{pDocName="Velara",pDataType="RAW"};
      StartDocPrinter(h,1,ref d); StartPagePrinter(h);
      int w; WritePrinter(h,b,b.Length,out w);
      EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
`;

function sendToWindowsPrinter(printerName, buffer) {
  const tmpFile = path.join(os.tmpdir(), `vp_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(tmpFile, buffer);
  // Escapa aspas simples no nome da impressora para uso no PowerShell
  const safeName = printerName.replace(/'/g, "''");
  const safeTmp = tmpFile.replace(/\\/g, "\\\\");
  const ps = `
Add-Type -TypeDefinition @'
${PS_RAWPRINT_TYPE}
'@ -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes('${safeTmp}')
[VelaraRawPrint]::Send('${safeName}', $bytes)
Remove-Item '${safeTmp}' -Force -ErrorAction SilentlyContinue
`;
  const result = spawnSync("powershell", ["-NonInteractive", "-NoProfile", "-Command", ps], {
    timeout: 15000,
    encoding: "utf8",
  });
  // Garante remoção do arquivo temp mesmo em erro
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  if (result.status !== 0) {
    const errMsg = (result.stderr || result.stdout || "Falha ao enviar para impressora Windows").trim();
    throw new Error(errMsg.slice(0, 300));
  }
}

// Roteamento por tipo de impressora baseado no conteúdo de printer_ip
// - "192.168.1.x" → TCP/IP (comportamento original)
// - "COM3", "LPT1" → porta serial/paralela
// - qualquer outro texto → impressora Windows por nome
function routePrint(job, buffer) {
  const id = (job.printer_ip || "").trim();
  if (/^(COM|LPT)\d+$/i.test(id)) {
    log(`→ Serial ${id}`);
    return sendToSerialPort(id, buffer);
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(id)) {
    return sendToPrinter(id, job.printer_port || 9100, buffer);
  }
  log(`→ Windows Printer "${id}"`);
  return sendToWindowsPrinter(id, buffer);
}

// Lista impressoras disponíveis no sistema (COM ports + Windows Printers)
// ─── Sondagem de impressoras ─────────────────────────────────────────────
// Descobre o que ESTÁ CONFIGURADO no painel (não só o que já imprimiu) e
// testa cada alvo. É o que permite avisar "a cozinha caiu" antes de chegar
// pedido, em vez de descobrir quando o cupom não sai.
async function refreshConfiguredPrinters() {
  if (!TENANT_USER_ID) return;

  // O ideal seria ler pdv_production_centers, mas essa tabela exige sessão
  // autenticada (RLS: is_establishment_member) e a bridge só tem a chave
  // anônima. Então derivamos do histórico de impressão, que ela enxerga.
  // Quando a bridge passar a autenticar por estabelecimento, trocar por uma
  // leitura direta dos centros — aí impressora recém-configurada que ainda
  // não imprimiu também aparece.
  const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pdv_print_jobs")
    .select("center_name, printer_ip, printer_port, created_at")
    .eq("tenant_user_id", TENANT_USER_ID)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return;

  (data || []).forEach((j) => {
    const target = (j.printer_ip || "").trim();
    if (!target) return;
    const e = printerEntry(target);
    if (j.center_name) e.centers.add(j.center_name);
    if (!e.port) e.port = j.printer_port || 9100;
  });
}

/** Abre e fecha uma conexão TCP só para saber se a impressora atende. */
function probeTcp(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(3000);
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, ip, () => finish(true));
  });
}

async function probeAllPrinters() {
  const windowsNames = (await listAvailablePrinters()).windows_printers || [];
  for (const e of printers.values()) {
    const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(e.target);
    if (isIp) {
      e.online = await probeTcp(e.target, e.port || 9100);
    } else if (/^(COM|LPT)\d+$/i.test(e.target)) {
      e.online = null; // porta serial só dá para saber ao imprimir
    } else {
      // Impressora Windows: existir na lista é o que dá para verificar sem
      // mandar papel. Comparação sem caixa porque o painel guarda o que o
      // usuário digitou ("bar" vs "Bar").
      e.online = windowsNames.some(
        (n) => String(n).toLowerCase() === e.target.toLowerCase(),
      );
    }
    e.checked_at = new Date().toISOString();
  }
}

async function listAvailablePrinters() {
  const result = { com_ports: [], windows_printers: [] };
  if (process.platform !== "win32") return result;

  // Detecta COM ports testando abertura (COM1..COM30)
  const comChecks = Array.from({ length: 30 }, (_, i) => `COM${i + 1}`);
  for (const port of comChecks) {
    try {
      const devPath = `\\\\.\\${port}`;
      // Tentativa de abertura sem escrita para verificar existência
      const fd = fs.openSync(devPath, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
      fs.closeSync(fd);
      result.com_ports.push(port);
    } catch (_) {
      // porta não existe ou sem acesso — ignora
    }
  }

  // Lista impressoras Windows via PowerShell
  const ps = spawnSync(
    "powershell",
    ["-NonInteractive", "-NoProfile", "-Command",
      "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"],
    { timeout: 8000, encoding: "utf8" },
  );
  if (ps.status === 0 && ps.stdout) {
    try {
      const parsed = JSON.parse(ps.stdout.trim());
      result.windows_printers = Array.isArray(parsed) ? parsed : [parsed];
    } catch (_) {}
  }
  return result;
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

  if (!job.printer_ip || !String(job.printer_ip).trim()) {
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
  const printerKey = ip.trim();
  const key = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(printerKey) ? `${printerKey}:${port}` : printerKey;
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
        composition_group_label: p.composition_group_label,
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

  const ticketLabel = p.ticket_number != null
    ? `Pedido #${String(p.ticket_number).padStart(3, "0")}`
    : (p.order_number ? `Pedido #${p.order_number}` : null);
  const subheader = [
    `Centro: ${job.center_name ?? "—"}`,
    kind === "order"
      ? (ticketLabel || `Pedido #${p.order_number}`)
      : (ticketLabel || `Comanda #${p.comanda_number}`),
    formatDateTime(),
  ];
  if (kind !== "delivery" && p.waiter_name) {
    subheader.push(`Garçom: ${p.waiter_name}`);
  }
  if (items.length > 1) {
    subheader.push(`Itens: ${items.length}`);
  }

  const body = items.map((it) => ({
    product_name: it.product_name,
    quantity: it.quantity,
    notes: it.notes,
    modifiers: it.modifiers,
    parent_product_name: it.is_composite_child ? it.parent_product_name : null,
    composition_group_label: it.is_composite_child ? (it.composition_group_label || null) : null,
  }));


  const buf = kind === "comanda_caixa"
    ? buildCaixaReceipt(p)
    : buildReceipt({ mesa, comanda, subheader, body, centerName: job.center_name });

  const existing = printerQueues.get(key);
  if (existing && existing.depth > 0) {
    log(`⏳ Aguardando fila de ${ip} (${existing.depth} job(s) à frente) — job ${job.id}`);
  }

  const { promise } = enqueueForPrinter(key, async () => {
    const attemptNumber = (job.attempts || 0) + 1;

    // Claim atômico: só atualiza se o job ainda estiver em 'pending'.
    // Garante que duas instâncias do bridge nunca processem o mesmo job.
    const { data: claimed, error: claimError } = await supabase
      .from("pdv_print_jobs")
      .update({ status: "printing", attempts: attemptNumber })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id");
    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) {
      log(`⚠ [PID:${process.pid}] Job ${job.id} já assumido por outra instância — abortando`);
      return;
    }

    const logSummary = items.length === 1
      ? `${items[0].quantity}x ${items[0].product_name}`
      : `${items.length} itens (${items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)} un)`;
    log(`→ [PID:${process.pid}] Job ${job.id} | kind=${job.source_kind} | source=${job.source_item_id ?? "null"} | centro=${job.center_name} | ${logSummary} → ${ip}:${port} (tent. ${attemptNumber}/${MAX_ATTEMPTS})`);

    try {
      await routePrint(job, buf);
      await supabase
        .from("pdv_print_jobs")
        .update({ status: "printed", printed_at: new Date().toISOString(), error_message: null })
        .eq("id", job.id);
      state.jobs_processed += 1;
      state.last_print_at = new Date().toISOString();
      state.last_error = null;
      const okEntry = printerEntry(ip);
      if (job.center_name) okEntry.centers.add(job.center_name);
      okEntry.online = true;
      okEntry.last_print_at = state.last_print_at;
      okEntry.last_error = null;
      log(`✓ [PID:${process.pid}] Impresso job ${job.id} → ${ip}:${port}`);
    } catch (err) {
      const msg = err.message || String(err);
      state.last_error = msg;
      const errEntry = printerEntry(ip);
      if (job.center_name) errEntry.centers.add(job.center_name);
      errEntry.online = false;
      errEntry.last_error = msg;
      errEntry.last_error_at = new Date().toISOString();
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
        log(`✗ Falha definitiva [${key}] — ${msg} (job ${job.id}, ${MAX_ATTEMPTS} tentativas)`);
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
  if (TENANT_USER_ID && data.tenant_user_id !== TENANT_USER_ID) {
    log(`⚠ Job ${jobId} é de outro estabelecimento — ignorado`);
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
let hasBooted = false;
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

  // Com mais de um estabelecimento na tabela, ouvir a tabela inteira faz a
  // bridge de um cliente imprimir o pedido do outro. O filtro server-side corta
  // isso na origem; sem TENANT_USER_ID o comportamento é o de sempre.
  const changesFilter = {
    event: "INSERT",
    schema: "public",
    table: "pdv_print_jobs",
    ...(TENANT_USER_ID ? { filter: `tenant_user_id=eq.${TENANT_USER_ID}` } : {}),
  };

  const channel = supabase
    .channel(name)
    .on(
      "postgres_changes",
      changesFilter,
      (payload) => {
        const job = payload?.new;
        if (!job || job.status !== "pending") return;
        // Rede de segurança: se o filtro do Realtime falhar (reconexão, versão
        // antiga do servidor), não imprime job de outro dono.
        if (TENANT_USER_ID && job.tenant_user_id !== TENANT_USER_ID) return;
        log(`📥 Novo job ${job.id} (${job.payload?.product_name}) status=${job.status}`);
        processJob(job).catch((e) => log(`✗ processJob: ${e.message}`));
      },
    )
    .subscribe((status, err) => {
      state.subscription_status = status;
      if (status === "SUBSCRIBED") {
        reconnectDelay = 30000;
        log(`✓ Realtime conectado (PID ${process.pid}). Ouvindo INSERT em pdv_print_jobs.`);
        if (!hasBooted) {
          hasBooted = true;
          reprocessPending().catch((e) => log(`✗ reprocessPending: ${e.message}`));
        }
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
    // Private Network Access: o painel roda em HTTPS publico e chama
    // http://localhost. Sem este cabecalho no preflight, o Chrome derruba a
    // chamada antes de sair do navegador — e o painel mostra "Bridge offline"
    // mesmo com o servico rodando. So afeta o botao de testar impressora; a
    // impressao de verdade chega pelo Realtime, sem passar pelo navegador.
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    // Painel de monitoramento. O pkg embute panel.html como asset, então o
    // caminho vale tanto rodando por node quanto dentro do .exe.
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      try {
        const html = fs.readFileSync(path.join(__dirname, "panel.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Painel indisponivel: " + e.message);
      }
    }

    // Painel: tudo que a tela precisa numa chamada só.
    if (req.method === "GET" && req.url === "/status") {
      getPendingCount().then((pending) => {
        const lista = [...printers.values()].map((e) => ({
          target: e.target,
          centers: [...e.centers],
          online: e.online,
          last_print_at: e.last_print_at,
          last_error: e.last_error,
          last_error_at: e.last_error_at,
          checked_at: e.checked_at,
          kind: /^\d{1,3}(\.\d{1,3}){3}$/.test(e.target)
            ? "rede"
            : /^(COM|LPT)\d+$/i.test(e.target)
              ? "serial"
              : "usb",
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          version: VERSION,
          establishment: ESTABLISHMENT_NAME,
          connected: state.subscription_status === "SUBSCRIBED",
          subscription_status: state.subscription_status,
          started_at: state.started_at,
          last_print_at: state.last_print_at,
          last_error: state.last_error,
          jobs_processed: state.jobs_processed,
          jobs_failed: state.jobs_failed,
          pending_jobs_count: pending,
          printers: lista,
          log: logRing.slice(-120).reverse(),
        }));
      });
      return;
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
          version: VERSION,
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
          const body = JSON.parse(buf || "{}");
          // Aceita { ip, port } (TCP) ou { printerName } (COM/Windows)
          const { ip, port = 9100, printerName, centerName = "Teste" } = body;
          const target = printerName || ip;
          if (!target) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ok: false, error: "IP ou printerName obrigatório" }));
          }
          const receiptBuf = buildReceipt({
            mesa: "TESTE",
            comanda: "Print Bridge",
            subheader: ["Centro: " + centerName, "*** TESTE DE IMPRESSAO ***", formatDateTime()],
            body: [{ product_name: "Print Bridge OK", quantity: 1 }],
            centerName,
          });
          const fakeJob = { printer_ip: target, printer_port: port };
          await routePrint(fakeJob, receiptBuf);
          log(`✓ Teste impresso em [${target}]`);
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

    if (req.method === "GET" && req.url === "/list-printers") {
      listAvailablePrinters().then((printers) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(printers));
      }).catch((err) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ com_ports: [], windows_printers: [], error: err.message }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      log(`✗ Porta ${BRIDGE_HTTP_PORT} já em uso — outra instância do bridge está rodando. Encerrando.`);
      process.exit(1);
    }
    log(`✗ Erro no servidor HTTP: ${err.message}`);
  });
  server.listen(Number(BRIDGE_HTTP_PORT), "127.0.0.1", () => {
    log(`HTTP local em http://localhost:${BRIDGE_HTTP_PORT} (health, test-print, reprint)`);
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────
async function resetOrphanedPrintingJobs() {
  // Jobs travados em 'printing' há > 5 min = bridge crashou antes de concluir.
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let q = supabase
    .from("pdv_print_jobs")
    .update({ status: "pending", error_message: "reset: bridge restart" })
    .eq("status", "printing")
    .lt("created_at", cutoff);
  if (TENANT_USER_ID) q = q.eq("tenant_user_id", TENANT_USER_ID);
  const { data, error } = await q;
  if (!error) log(`✓ Jobs órfãos em 'printing' resetados para 'pending': ${(data ?? []).length}`);
  else log(`✗ resetOrphanedPrintingJobs: ${error.message}`);
}

// Sondagem periódica: descobre impressora fora do ar mesmo sem pedido nenhum
// chegando. É o que permite avisar antes de faltar cupom na cozinha.
async function cicloDeSondagem() {
  try {
    await refreshConfiguredPrinters();
    await probeAllPrinters();
  } catch (e) {
    log(`✗ sondagem: ${e.message}`);
  }
}

log(`=== Velara Print Bridge ${VERSION} — ${ESTABLISHMENT_NAME} ===`);
log(`PID: ${process.pid} | Porta HTTP: ${BRIDGE_HTTP_PORT} | Iniciado em: ${new Date().toISOString()}`);
if (TENANT_USER_ID) log(`Filtro de tenant: ${TENANT_USER_ID}`);
log(`Painel: http://localhost:${BRIDGE_HTTP_PORT}/`);
startHttpServer();
cicloDeSondagem();
setInterval(cicloDeSondagem, 60000);
resetOrphanedPrintingJobs()
  .catch((e) => log(`✗ resetOrphan: ${e.message}`))
  .finally(() => connectRealtime());

process.on("uncaughtException", (err) => log(`✗ uncaught: ${err.message}`));
process.on("unhandledRejection", (err) => log(`✗ unhandled: ${err}`));
