"use strict";

// Teste do caminho de impressão do Windows. Só roda em Windows (CI).
//
// Este é o portão que faltava. A verificação de spooler — que decide se um
// cupom saiu de verdade, e que é a correção do `printed` mentiroso que deixou
// 11 comandas do La Vecchia sem sair papel — foi escrita e empacotada sem
// nunca ter sido executada num Windows. Aqui ela é exercitada com uma
// impressora real do spooler, em três cenários: imprime, pausada e inexistente.
//
//   node test/windows-print.test.js

const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

if (process.platform !== "win32") {
  console.log("SKIP: este teste só faz sentido no Windows");
  process.exit(0);
}

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://exemplo.supabase.co";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "chave-de-teste";
// Timeout curto: em CI não vale esperar 15s para provar que a fila travou.
process.env.WINDOWS_SPOOL_TIMEOUT_MS = "6000";
process.env.BRIDGE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "velara-ci-"));

const winSpool = require("../lib/win-spool");
const receipts = require("../lib/receipts");

const IMPRESSORA = "VelaraTesteCI";
const SAIDA = path.join(process.env.BRIDGE_DATA_DIR, "saida.prn");

const ps = (script) =>
  execFileSync("powershell", ["-NonInteractive", "-NoProfile", "-Command", script], {
    encoding: "utf8",
    timeout: 60000,
  });

// String literal do PowerShell. Entre aspas simples a barra invertida é
// literal: escapá-la produz um caminho com \\ dentro, e o Add-PrinterPort
// responde 0x8007007b (nome inválido). Só a aspa simples precisa ser dobrada.
const psq = (valor) => "'" + String(valor).replace(/'/g, "''") + "'";

function preparar() {
  // Porta de arquivo + driver de texto puro: os bytes RAW que a bridge manda
  // caem num arquivo, então dá para conferir byte a byte o que "foi impresso".
  //
  // O driver "Generic / Text Only" existe no repositório de drivers do Windows
  // mas não vem instalado no runner: é preciso pedir a instalação antes.
  ps(`
    $ErrorActionPreference='Stop'
    if (-not (Get-PrinterDriver -Name 'Generic / Text Only' -ErrorAction SilentlyContinue)) {
      Add-PrinterDriver -Name 'Generic / Text Only'
    }
    if (Get-Printer -Name ${psq(IMPRESSORA)} -ErrorAction SilentlyContinue) { Remove-Printer -Name ${psq(IMPRESSORA)} }
    if (-not (Get-PrinterPort -Name ${psq(SAIDA)} -ErrorAction SilentlyContinue)) {
      Add-PrinterPort -Name ${psq(SAIDA)}
    }
    Add-Printer -Name ${psq(IMPRESSORA)} -DriverName 'Generic / Text Only' -PortName ${psq(SAIDA)}
  `);
}

function limpar() {
  try {
    ps(`Remove-Printer -Name ${psq(IMPRESSORA)} -ErrorAction SilentlyContinue`);
  } catch (_) {}
}

async function main() {
  const falhas = [];
  const teste = async (nome, fn) => {
    try {
      await fn();
      console.log(`ok  - ${nome}`);
    } catch (e) {
      falhas.push(`${nome}: ${e.message}`);
      console.log(`NOK - ${nome}: ${e.message}`);
    }
  };

  preparar();

  const cupom = receipts.buildReceipt({
    mesa: "TESTE CI",
    comanda: "GitHub Actions",
    subheader: ["Centro: CI", receipts.formatDateTime()],
    body: [{ product_name: "Cupom de teste", quantity: 1 }],
    centerName: "CI",
    establishmentName: "Velara CI",
  });

  await teste("imprime e o spooler confirma que o documento saiu", async () => {
    if (fs.existsSync(SAIDA)) fs.unlinkSync(SAIDA);
    await winSpool.rawPrint(IMPRESSORA, cupom);
    // O spooler escreve de forma assíncrona mesmo depois de entregar.
    for (let i = 0; i < 40 && !fs.existsSync(SAIDA); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(fs.existsSync(SAIDA), "nada foi escrito na porta da impressora");
    const bytes = fs.readFileSync(SAIDA);
    assert.ok(bytes.length > 100, `saída curta demais: ${bytes.length} bytes`);
    assert.ok(bytes.includes(Buffer.from("Cupom de teste".toUpperCase())), "o conteúdo do cupom não chegou");
  });

  await teste("impressora pausada estoura o timeout em vez de mentir que imprimiu", async () => {
    ps(`Suspend-Printer -Name ${psq(IMPRESSORA)}`);
    try {
      await assert.rejects(
        () => winSpool.rawPrint(IMPRESSORA, cupom),
        (err) => {
          assert.match(
            err.message,
            /nao imprimiu|OFFLINE|pausada|fila/i,
            `mensagem inesperada: ${err.message}`,
          );
          return true;
        },
        "impressora pausada NÃO pode ser reportada como sucesso — é o bug do `printed` mentiroso",
      );
      // O job preso tem de ser cancelado, senão o retry empilha cópias e todas
      // saem juntas quando alguém retomar a impressora.
      const presos = ps(
        `@(Get-CimInstance Win32_PrintJob | Where-Object { $_.Name -like ${psq(IMPRESSORA + ",*")} }).Count`,
      ).trim();
      assert.equal(presos, "0", `sobraram ${presos} job(s) presos na fila`);
    } finally {
      ps(`Resume-Printer -Name ${psq(IMPRESSORA)}`);
    }
  });

  await teste("impressora inexistente falha com mensagem clara", async () => {
    await assert.rejects(
      () => winSpool.rawPrint("ImpressoraQueNaoExiste123", cupom),
      /nao encontrada|not found/i,
    );
  });

  await teste("sondagem enxerga a impressora e a fila", async () => {
    const r = await winSpool.probePrinters();
    assert.ok(r.names.includes(IMPRESSORA), "a impressora criada não apareceu na sondagem");
    const st = r.byName.get(IMPRESSORA.toLowerCase());
    assert.ok(st, "sem estado para a impressora");
    assert.equal(typeof st.queued, "number");
  });

  limpar();

  if (falhas.length) {
    console.error(`\n${falhas.length} falha(s):\n- ${falhas.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nTodos os testes do caminho Windows passaram.");
}

main().catch((e) => {
  limpar();
  console.error("erro fatal:", e.message);
  try {
    console.error("\nDrivers disponíveis neste Windows:");
    console.error(ps("Get-PrinterDriver | Select-Object -ExpandProperty Name"));
  } catch (_) {}
  process.exit(1);
});
