"use strict";

// Impressora térmica de mentira: aceita conexões na 9100, decodifica o ESC/POS
// para texto legível no terminal e responde aos comandos de status DLE EOT com
// o estado que você mandar.
//
// É o que permite exercitar no macOS o caminho TCP inteiro — inclusive "sem
// papel", "tampa aberta" e impressora que não responde nada.
//
//   node tools/fake-printer.js --port 9100 --status ok
//   node tools/fake-printer.js --port 9101 --status sem-papel
//   node tools/fake-printer.js --port 9102 --status mudo --delay 8000
//
// Estados: ok | sem-papel | tampa-aberta | offline | mudo (não responde status)

const net = require("net");

const args = process.argv.slice(2);
const arg = (nome, def) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const port = Number(arg("port", 9100));
const status = arg("status", "ok");
const delay = Number(arg("delay", 0));
const quiet = args.includes("--quiet");

let cupons = 0;

// Bytes de status ESC/POS: bit1 e bit4 sempre ligados (0x12) é o que marca
// resposta válida; a bridge usa isso para separar status de lixo.
function respostaStatus(n) {
  if (status === "mudo") return null;
  if (n === 1) return Buffer.from([status === "offline" ? 0x12 | 0x08 : 0x12]);
  if (n === 2) {
    let b = 0x12;
    if (status === "tampa-aberta") b |= 0x04;
    if (status === "sem-papel") b |= 0x20 | 0x40;
    return Buffer.from([b]);
  }
  if (n === 4) {
    let b = 0x12;
    if (status === "sem-papel") b |= 0x60;
    return Buffer.from([b]);
  }
  return null;
}

/** ESC/POS → texto, o suficiente para conferir o cupom a olho. */
function decodificar(buf) {
  const linhas = [];
  let atual = "";
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x1b && buf[i + 1] === 0x40) { i += 1; continue; }            // reset
    if (b === 0x1b && buf[i + 1] === 0x61) { i += 2; continue; }            // alinhamento
    if (b === 0x1d && buf[i + 1] === 0x21) { i += 2; continue; }            // tamanho
    if (b === 0x1d && buf[i + 1] === 0x42) { i += 2; continue; }            // vídeo invertido (GS B)
    if (b === 0x1d && buf[i + 1] === 0x56) { i += 3; linhas.push("──── corte ────"); continue; }
    if (b === 0x10 && buf[i + 1] === 0x04) { i += 2; continue; }            // DLE EOT
    if (b === 0x1d && buf[i + 1] === 0x28 && buf[i + 2] === 0x6b) {         // QR
      const len = buf[i + 3] | (buf[i + 4] << 8);
      i += 4 + len;
      atual += "[QR]";
      continue;
    }
    if (b === 0x0a) { linhas.push(atual); atual = ""; continue; }
    if (b >= 0x20) atual += String.fromCharCode(b);
  }
  if (atual) linhas.push(atual);
  return linhas;
}

const server = net.createServer((socket) => {
  const buffers = [];
  socket.on("data", async (chunk) => {
    // Comando de status é de tempo real: responde na hora, sem entrar no cupom.
    for (let i = 0; i < chunk.length - 2; i++) {
      if (chunk[i] === 0x10 && chunk[i + 1] === 0x04) {
        const r = respostaStatus(chunk[i + 2]);
        if (r) socket.write(r);
      }
    }
    const semStatus = Buffer.from(chunk.filter((_, i, a) => !(a[i - 2] === 0x10 && a[i - 1] === 0x04)));
    if (semStatus.length > 3) buffers.push(chunk);
    if (delay) await new Promise((r) => setTimeout(r, delay));
  });
  socket.on("close", () => {
    const buf = Buffer.concat(buffers);
    if (buf.length < 20) return; // só sondagem de porta
    cupons += 1;
    if (!quiet) {
      console.log(`\n═══ cupom ${cupons} na porta ${port} (${buf.length} bytes) ═══`);
      decodificar(buf).forEach((l) => console.log("  " + l));
    } else {
      console.log(`cupom ${cupons} (${buf.length} bytes)`);
    }
  });
  socket.on("error", () => {});
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Impressora simulada em 127.0.0.1:${port} — estado "${status}"${delay ? `, atraso ${delay}ms` : ""}`);
});

process.on("SIGINT", () => {
  console.log(`\nTotal: ${cupons} cupom(ns) na porta ${port}`);
  process.exit(0);
});
