"use strict";

// Transportes de impressão: TCP 9100, porta serial/paralela e impressora
// registrada no Windows. Todos respeitam AbortSignal, porque o timeout de job
// precisa cortar o trabalho de verdade — "liberar o slot da fila" enquanto o
// socket continua vivo apenas troca um travamento visível por um invisível.

const net = require("net");
const fs = require("fs");

const { config } = require("./config");
const { log } = require("./log");
const winSpool = require("./win-spool");

const RE_IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const RE_SERIAL = /^(COM|LPT)\d+$/i;

function normalizeIp(ip) {
  if (!ip || typeof ip !== "string") return ip;
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return parts.map((p) => String(parseInt(p, 10))).join(".");
}

/** Como a impressora é endereçada, a partir do texto que o usuário cadastrou. */
function targetKind(target) {
  const id = String(target || "").trim();
  if (RE_SERIAL.test(id)) return "serial";
  if (RE_IPV4.test(id)) return "rede";
  return "usb";
}

/**
 * Chave de fila. Usa o IP normalizado: sem isso "192.168.001.51" e
 * "192.168.1.51" viram duas filas para a mesma impressora, e a serialização
 * que evita bytes intercalados deixa de valer.
 */
function queueKey(job) {
  const id = normalizeIp(String(job.printer_ip || "").trim());
  return targetKind(id) === "rede" ? `${id}:${job.printer_port || 9100}` : id;
}

// ─── Status ESC/POS (DLE EOT) ────────────────────────────────────────────
// No caminho TCP, "escrevi no socket" nunca significou "saiu papel": impressora
// sem papel ou com a tampa aberta aceita os bytes e o banco grava `printed`.
// DLE EOT é comando de tempo real e responde 1 byte mesmo com a impressora em
// erro. Todo byte de status tem bit0=0, bit1=1 e bit4=1 — é assim que
// separamos resposta real de eco ou lixo de print server.
function decodeStatus(n, byte) {
  if (byte === undefined || (byte & 0x93) !== 0x12) return null;
  if (n === 1) return { offline: (byte & 0x08) !== 0 };
  if (n === 2) {
    return {
      coverOpen: (byte & 0x04) !== 0,
      paperFeedStop: (byte & 0x20) !== 0,
      error: (byte & 0x40) !== 0,
    };
  }
  if (n === 4) {
    return {
      paperNearEnd: (byte & 0x0c) !== 0,
      paperOut: (byte & 0x60) !== 0,
    };
  }
  return null;
}

function askStatus(socket, n, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (byte) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.removeListener("data", onData);
      resolve(decodeStatus(n, byte));
    };
    const onData = (buf) => finish(buf && buf.length ? buf[0] : undefined);
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    socket.on("data", onData);
    socket.write(Buffer.from([0x10, 0x04, n]));
  });
}

/**
 * Lê o estado da impressora de rede.
 * @returns {Promise<{known: boolean, problems: string[]}>}
 * Impressora que não responde vira `known:false` e a impressão segue: muito
 * clone não implementa DLE EOT, e bloquear impressão que funcionava seria
 * trocar um problema raro por um diário.
 */
async function readTcpStatus(socket) {
  const t = config.tcpStatusTimeoutMs;
  const s1 = await askStatus(socket, 1, t);
  if (!s1) return { known: false, problems: [] };
  const [s2, s4] = [await askStatus(socket, 2, t), await askStatus(socket, 4, t)];

  const problems = [];
  if (s1.offline) problems.push("offline");
  if (s2?.coverOpen) problems.push("tampa aberta");
  if (s4?.paperOut) problems.push("SEM PAPEL");
  else if (s2?.paperFeedStop) problems.push("papel travado");
  if (s2?.error && problems.length === 0) problems.push("erro na impressora");
  return { known: true, problems, paperNearEnd: !!s4?.paperNearEnd };
}

function connectTcp(ip, port, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };
    const onAbort = () => fail(new Error("cancelado (timeout do job)"));

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => fail(new Error(`Timeout de conexão (${Math.round(timeoutMs / 1000)}s)`)));
    socket.once("error", fail);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    socket.connect(port, ip, () => {
      if (settled) return;
      settled = true;
      socket.once("close", () => signal?.removeEventListener?.("abort", onAbort));
      resolve(socket);
    });
  });
}

async function sendToTcp(ip, port, payload, { signal } = {}) {
  const socket = await connectTcp(ip, port, config.tcpTimeoutMs, signal);
  try {
    let statusAntes = { known: false, problems: [] };
    if (config.tcpStatusCheck) {
      statusAntes = await readTcpStatus(socket);
      if (statusAntes.problems.length > 0) {
        // Não envia: cupom que entra numa impressora sem papel vira papel
        // perdido quando alguém repõe, e o banco jura que imprimiu.
        throw new Error(statusAntes.problems.join(", ").toUpperCase());
      }
    }

    await new Promise((resolve, reject) => {
      socket.write(payload, (err) => (err ? reject(err) : resolve()));
    });
    // Folga para a impressora consumir o buffer antes de fecharmos o socket.
    await new Promise((r) => setTimeout(r, 200));

    if (config.tcpStatusCheck && statusAntes.known) {
      // Se o papel acabou DURANTE a impressão, o cupom saiu cortado ao meio.
      // Melhor reimprimir inteiro do que aceitar meio pedido na cozinha.
      const depois = await readTcpStatus(socket);
      if (depois.known && depois.problems.length > 0) {
        throw new Error(`${depois.problems.join(", ").toUpperCase()} durante a impressão`);
      }
      if (depois.paperNearEnd) log(`⚠ ${ip}: papel acabando`);
    }
  } finally {
    socket.destroy();
  }
}

// Porta serial (COM1-COM256) ou paralela (LPT1-LPT9) — Node.js puro, sem lib
// externa. O timeout é o ponto crítico: sem ele, uma porta que aceita o write
// mas nunca devolve o callback trava aquela fila para sempre (era o caso na
// 1.5.0, que não tinha timeout nenhum aqui).
function sendToSerialPort(portName, buffer, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const devPath = process.platform === "win32"
      ? `\\\\.\\${portName.toUpperCase()}`
      : `/dev/${portName}`; // fallback Linux: /dev/ttyUSB0
    const stream = fs.createWriteStream(devPath, { flags: "a" });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      stream.destroy();
      err ? reject(err) : resolve();
    };
    const onAbort = () => finish(new Error("cancelado (timeout do job)"));
    const timer = setTimeout(
      () => finish(new Error(`Timeout na porta ${portName} (${Math.round(config.serialTimeoutMs / 1000)}s)`)),
      config.serialTimeoutMs,
    );
    signal?.addEventListener?.("abort", onAbort, { once: true });

    stream.once("error", finish);
    stream.write(buffer, (err) => {
      if (err) return finish(err);
      stream.end(() => finish());
    });
  });
}

/**
 * Roteamento por tipo de impressora, a partir do conteúdo de printer_ip:
 * "192.168.1.x" → TCP/IP · "COM3"/"LPT1" → serial · qualquer outro texto →
 * impressora do Windows por nome.
 */
function routePrint(job, buffer, { signal } = {}) {
  const id = String(job.printer_ip || "").trim();
  const kind = targetKind(id);
  if (kind === "serial") {
    log(`→ Serial ${id}`);
    return sendToSerialPort(id, buffer, { signal });
  }
  if (kind === "rede") {
    return sendToTcp(normalizeIp(id), job.printer_port || 9100, buffer, { signal });
  }
  log(`→ Windows Printer "${id}"`);
  return winSpool.rawPrint(id, buffer, { signal });
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

module.exports = {
  routePrint,
  sendToTcp,
  sendToSerialPort,
  probeTcp,
  normalizeIp,
  targetKind,
  queueKey,
  RE_IPV4,
  RE_SERIAL,
};
