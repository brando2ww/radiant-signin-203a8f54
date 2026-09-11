"use strict";

// Testes que rodam no macOS, sem impressora, sem Windows e sem banco.
// Cobrem justamente onde moravam os bugs de produção: renderização, diário
// (reimpressão dupla), fila (travamento eterno) e quarentena.
//
//   npm test

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Pasta de dados isolada: o diário não pode encostar no da instalação real.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "velara-test-"));
process.env.BRIDGE_DATA_DIR = tmp;
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://exemplo.supabase.co";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "chave-de-teste";

const receipts = require("../lib/receipts");
const journal = require("../lib/journal");
const queue = require("../lib/queue");
const io = require("../lib/printer-io");

// ─── Recibos ─────────────────────────────────────────────────────────────

test("comanda de cozinha sai com acento removido e corte no fim", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "Cozinha",
      source_kind: "delivery",
      payload: {
        kind: "delivery",
        mesa_numero: "DELIVERY",
        comanda_nome: "João Ação",
        comanda_number: "007",
        items: [{ product_name: "Pão de alho", quantity: 2, notes: "sem cebola", modifiers: [{ name: "2x Queijo" }] }],
      },
    },
    "Restaurante Teste",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /Restaurante Teste/);
  assert.match(texto, /DELIVERY/);
  assert.match(texto, /Joao Acao/, "acentos precisam sair (a impressora usa outra code page)");
  assert.match(texto, /2x PAO DE ALHO/);
  assert.match(texto, /OBS: sem cebola/);
  assert.match(texto, /\+ 2x Queijo/);
  // GS V A 5 = corte parcial
  assert.ok(buf.includes(Buffer.from([0x1d, 0x56, 0x41, 0x05])), "cupom tem de terminar com corte");
});

test("comanda do caixa traz totais, endereço e troco", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "Caixa Principal",
      source_kind: "comanda_caixa",
      payload: {
        kind: "comanda_caixa",
        order_number: "12",
        customer_name: "Maria",
        order_type: "delivery",
        delivery_address: "Rua A, 100",
        delivery_complement: "Ap 302",
        subtotal: 50,
        delivery_fee: 8,
        discount_amount: 3,
        total: 55,
        payment_method: "cash",
        payment_status: "pending",
        change_amount: 100,
        items: [{ product_name: "Pizza", quantity: 1 }],
      },
    },
    "Restaurante Teste",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /COMANDA CAIXA/);
  assert.match(texto, />> ENTREGA </);
  assert.match(texto, /Compl\.: Ap 302/);
  assert.match(texto, /R\$ 55,00/);
  assert.match(texto, /Pagamento: Dinheiro/, "o banco grava em inglês; o cupom tem de sair em português");
  assert.match(texto, /Levar de troco: R\$ 45,00/);
});

test("comanda do caixa de pedido de marketplace sai no layout Bitbar, sem inventar taxa", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "Caixa Principal",
      source_kind: "comanda_caixa",
      payload: {
        kind: "comanda_caixa",
        order_number: "003",
        customer_name: "Joel Longaray",
        order_type: "pickup",
        subtotal: 42,
        discount_sponsor_ifood: 15,
        discount_sponsor_merchant: 5,
        total: 22.99,
        payment_method: "online",
        payment_status: "paid",
        external_code: "1407",
        items: [
          { product_name: "Monte Seu Prato pf", quantity: 1, subtotal: 0 },
          { product_name: "Frango a Parmegiana", quantity: 1, subtotal: 25 },
        ],
      },
    },
    "Restaurante Teste",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /BUSCAR/, "pedido pickup de marketplace usa o rótulo do Bitbar, não COMANDA CAIXA");
  assert.doesNotMatch(texto, /COMANDA CAIXA/);
  assert.match(texto, /iFood #1407/);
  assert.match(texto, /Desconto da Plataforma/, "desconto bancado pelo iFood sai separado do da loja");
  assert.match(texto, /Pagto Online/);
  assert.doesNotMatch(texto, /Taxa iFood/, "não existe dado real de taxa iFood — não pode aparecer inventado");
  assert.doesNotMatch(texto, /Via Motoboy/, "retirada no local não tem 2ª via de motoboy");
});

test("comanda do caixa de marketplace com entrega própria imprime a 2ª via do motoboy", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "Caixa Principal",
      source_kind: "comanda_caixa",
      payload: {
        kind: "comanda_caixa",
        order_number: "001",
        customer_name: "Ricardo",
        order_type: "delivery",
        delivery_address: "Rua A, 100",
        subtotal: 50,
        delivery_fee: 25,
        total: 66,
        payment_method: "online",
        payment_status: "paid",
        external_code: "2233",
        external_collection_code: "3755",
        items: [{ product_name: "Pizza", quantity: 1, subtotal: 50 }],
      },
    },
    "Restaurante Teste",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /codigo coleta 3755/);
  assert.match(texto, /Via Motoboy/);
  // a 2a via aparece DEPOIS da tabela de itens da 1a via
  const idxItens = texto.indexOf("Pizza");
  const idxMotoboy = texto.indexOf("Via Motoboy");
  assert.ok(idxItens > -1 && idxMotoboy > idxItens);
});

test("barra da mesa cobre a linha inteira em vídeo invertido", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "Bar",
      source_kind: "comanda",
      payload: {
        kind: "comanda",
        mesa_numero: "16",
        comanda_nome: "Jesus",
        order_number: "021",
        items: [{ product_name: "Caipirinha", quantity: 2 }],
      },
    },
    "Restaurante Teste",
  );
  // GS B 1 liga o vídeo invertido antes do texto da mesa, e GS B 0 desliga
  // logo depois — sem isso a barra não aparece preta na impressora real.
  const ligaIdx = buf.indexOf(Buffer.from([0x1d, 0x42, 0x01]));
  const desligaIdx = buf.indexOf(Buffer.from([0x1d, 0x42, 0x00]));
  assert.ok(ligaIdx > -1 && desligaIdx > ligaIdx, "vídeo invertido tem de ligar e desligar em volta da MESA");
  const meio = buf.subarray(ligaIdx, desligaIdx).toString("latin1");
  assert.match(meio, /MESA 16/);
});

test("DANFE leva QR Code e chave de acesso", () => {
  const buf = receipts.buildJobReceipt(
    {
      source_kind: "danfe",
      payload: {
        kind: "danfe",
        numero: 55,
        serie: 1,
        valor_total: 42.5,
        chave_acesso: "4326".repeat(11),
        qrcode: "https://sefaz.exemplo/consulta?p=123",
        items: [{ descricao: "Refrigerante", quantidade: 2, valor_unitario: 8, valor_bruto: 16 }],
        formas_pagamento: [{ forma_pagamento: "17", valor: 42.5 }],
      },
    },
    "Restaurante Teste",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /DANFE NFC-e/);
  assert.match(texto, /CHAVE DE ACESSO/);
  assert.match(texto, /PIX/);
  assert.ok(buf.includes(Buffer.from([0x1d, 0x28, 0x6b])), "QR Code é obrigatório por lei no DANFE");
});

// ─── Diário ──────────────────────────────────────────────────────────────

test("diário sobrevive a reinício e impede reimpressão", () => {
  journal.init();
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(journal.hasPrinted(id), false);
  journal.markPrinted(id);
  assert.equal(journal.hasPrinted(id), true);
  assert.deepEqual(journal.pendingConfirms(), [id], "impresso e ainda não confirmado no banco");

  // Simula reinício do processo: recarrega do disco.
  delete require.cache[require.resolve("../lib/journal")];
  const journal2 = require("../lib/journal");
  journal2.init();
  assert.equal(journal2.hasPrinted(id), true, "depois de reiniciar, a bridge ainda sabe que este cupom saiu");
  journal2.markConfirmed(id);
  assert.deepEqual(journal2.pendingConfirms(), []);
  journal2.forget(id);
  assert.equal(journal2.hasPrinted(id), false, "reimpressão manual desarma a proteção");
});

// ─── Fila e quarentena ───────────────────────────────────────────────────

test("fila serializa por impressora e roda impressoras diferentes em paralelo", async () => {
  const ordem = [];
  const tarefa = (nome, ms) => async () => {
    ordem.push(`inicio-${nome}`);
    await new Promise((r) => setTimeout(r, ms));
    ordem.push(`fim-${nome}`);
  };
  const a1 = queue.enqueue("impressora-a", tarefa("a1", 60)).promise;
  const a2 = queue.enqueue("impressora-a", tarefa("a2", 10)).promise;
  const b1 = queue.enqueue("impressora-b", tarefa("b1", 10)).promise;
  await Promise.all([a1, a2, b1]);

  assert.ok(
    ordem.indexOf("fim-a1") < ordem.indexOf("inicio-a2"),
    "dois cupons na mesma impressora não podem intercalar bytes",
  );
  assert.ok(ordem.indexOf("inicio-b1") < ordem.indexOf("fim-a1"), "outra impressora não espera a primeira");
});

test("tarefa que nunca resolve é cortada pelo timeout, e não trava a fila para sempre", async () => {
  let abortada = false;
  const travada = queue.enqueue(
    "impressora-travada",
    ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          abortada = true;
          reject(new Error("cancelado"));
        });
      }),
    { timeoutMs: 120 },
  ).promise;

  await assert.rejects(travada);
  assert.equal(abortada, true, "o sinal precisa chegar na tarefa: liberar o slot sem abortar deixa trabalho fantasma");

  // A fila daquela impressora continua utilizável.
  let rodou = false;
  await queue.enqueue("impressora-travada", async () => { rodou = true; }).promise;
  assert.equal(rodou, true);
});

test("três falhas seguidas põem a impressora em quarentena e as outras seguem", () => {
  const alvo = "impressora-com-defeito";
  assert.equal(queue.canAccept(alvo), true);
  queue.recordFailure(alvo);
  queue.recordFailure(alvo);
  assert.equal(queue.canAccept(alvo), true, "duas falhas ainda não isolam");
  queue.recordFailure(alvo);
  assert.equal(queue.canAccept(alvo), false, "na terceira, para de aceitar trabalho");
  assert.ok(queue.quarantinedUntil(alvo) > Date.now());
  assert.equal(queue.canAccept("outra-impressora"), true, "o defeito de uma não pode parar as demais");
  queue.recordSuccess(alvo);
  assert.equal(queue.canAccept(alvo), true, "sucesso zera a quarentena");
});

// ─── Roteamento ──────────────────────────────────────────────────────────

test("roteamento e chave de fila", () => {
  assert.equal(io.targetKind("192.168.0.81"), "rede");
  assert.equal(io.targetKind("COM3"), "serial");
  assert.equal(io.targetKind("bar"), "usb");
  assert.equal(
    io.queueKey({ printer_ip: "192.168.000.081", printer_port: 9100 }),
    "192.168.0.81:9100",
    "IP com zeros à esquerda tem de cair na MESMA fila, senão a serialização não vale",
  );
  assert.equal(io.queueKey({ printer_ip: " Bar " }), "Bar");
});
