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

test("comanda de entrega sai sem acento, com endereco e corte no fim", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "cozinha",
      source_kind: "delivery",
      payload: {
        kind: "delivery",
        order_number: "007",
        order_type: "delivery",
        customer_name: "João Ação",
        delivery_address: "Rua A, 100",
        external_code: "2233",
        items: [{ product_name: "Pão de alho", quantity: 2, notes: "sem cebola", modifiers: [{ name: "2x Queijo" }] }],
      },
    },
    "Restaurante Teste",
    "2.2.0",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /TELENTREGA/);
  assert.match(texto, /#007/);
  assert.match(texto, /JOAO ACAO/, "acentos precisam sair (a impressora usa outra code page)");
  assert.match(texto, /RUA A, 100/, "a producao precisa do endereco para conferir o despacho");
  assert.match(texto, /2   PAO DE ALHO/);
  assert.match(texto, /OBS: sem cebola/);
  assert.match(texto, /2X QUEIJO/);
  assert.match(texto, /Imp: cozinha/);
  // GS V A 5 = corte parcial
  assert.ok(buf.includes(Buffer.from([0x1d, 0x56, 0x41, 0x05])), "cupom tem de terminar com corte");
});

test("comanda de mesa leva tarja preta, pessoas e garcom", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "Bar",
      source_kind: "comanda",
      payload: {
        kind: "comanda",
        mesa_numero: "21",
        comanda_nome: "Vitor",
        person_number: 8,
        waiter_name: "Vitor",
        order_number: "021",
        items: [{ product_name: "Refri Rodizio", quantity: 1, modifiers: [{ name: "2x Pepsi 600ml" }] }],
      },
    },
    "Restaurante Teste",
    "2.2.0",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /Pessoas 8/);
  assert.match(texto, /Qtd  Descricao/);
  assert.match(texto, / 1   REFRI RODIZIO/);
  assert.match(texto, /     2X PEPSI 600ML/, "complemento alinha na mesma coluna da descricao");
  assert.match(texto, /Velara 2\.2\.0 - Vitor/);

  // GS B 1 liga a tarja invertida antes do nome da mesa, GS B 0 desliga depois.
  const liga = buf.indexOf(Buffer.from([0x1d, 0x42, 0x01]));
  const desliga = buf.indexOf(Buffer.from([0x1d, 0x42, 0x00]));
  assert.ok(liga > -1 && desliga > liga, "a tarja tem de ligar e desligar em volta da MESA");
  assert.match(buf.subarray(liga, desliga).toString("latin1"), /MESA 21/);
});

test("cupom do pedido alinha valores a direita e separa o desconto da plataforma", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "CAIXA",
      source_kind: "comanda_caixa",
      payload: {
        kind: "comanda_caixa",
        order_number: "003",
        order_type: "pickup",
        customer_name: "Joel Longaray",
        external_code: "1407",
        subtotal: 42,
        discount_sponsor_merchant: 5,
        discount_sponsor_ifood: 15,
        total: 22.99,
        payment_method: "online",
        payment_status: "paid",
        items: [{ product_name: "Frango a Parmegiana 150g", quantity: 1, subtotal: 25 }],
      },
    },
    "Restaurante Teste",
    "2.2.0",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /BUSCAR/, "retirada usa o rotulo de busca");
  assert.match(texto, /#003                 iFood #1407/);
  assert.match(texto, /               Subtotal    42,00/, "rotulo e valor encostam nas bordas");
  assert.match(texto, / Desconto da Plataforma   -15,00/, "o que o iFood banca sai separado do desconto da loja");
  assert.match(texto, /               Desconto    -5,00/);
  assert.match(texto, /            Valor Total    22,99/);
  assert.match(texto, /           Pagto Online    22,99/);
  assert.doesNotMatch(texto, /Taxa iFood/, "nao existe dado real de taxa iFood — nao pode aparecer inventado");
  assert.doesNotMatch(texto, /Via Motoboy/, "retirada no local nao tem 2a via de motoboy");
});

test("cupom de entrega repete o cabecalho na via do motoboy, sem os itens", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "CAIXA",
      source_kind: "comanda_caixa",
      payload: {
        kind: "comanda_caixa",
        order_number: "001",
        order_type: "delivery",
        customer_name: "Ricardo",
        delivery_address: "Rua A, 100",
        external_collection_code: "3755",
        subtotal: 50,
        delivery_fee: 25,
        total: 66,
        payment_method: "online",
        payment_status: "paid",
        items: [{ product_name: "Pizza", quantity: 1, subtotal: 50 }],
      },
    },
    "Restaurante Teste",
    "2.2.0",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /TELENTREGA/);
  assert.match(texto, /codigo coleta   3755/);
  const motoboy = texto.indexOf("Via Motoboy");
  assert.ok(motoboy > -1, "entrega propria precisa da 2a via");
  // A 2a via vem depois dos itens e nao repete a tabela de produtos.
  assert.ok(texto.indexOf("Pizza") < motoboy);
  assert.ok(!texto.slice(motoboy).includes("Pizza"), "a via do motoboy nao repete os itens");
  assert.match(texto.slice(motoboy), /Valor Total/, "mas repete os valores");
});

test("pedido em dinheiro mostra o troco a levar", () => {
  const buf = receipts.buildJobReceipt(
    {
      center_name: "CAIXA",
      source_kind: "comanda_caixa",
      payload: {
        kind: "comanda_caixa",
        order_number: "12",
        order_type: "delivery",
        customer_name: "Maria",
        delivery_address: "Rua A, 100",
        delivery_complement: "Ap 302",
        subtotal: 50,
        delivery_fee: 8,
        discount_amount: 3,
        total: 55,
        payment_method: "cash",
        payment_status: "pending",
        change_amount: 100,
        items: [{ product_name: "Pizza", quantity: 1, subtotal: 50 }],
      },
    },
    "Restaurante Teste",
    "2.2.0",
  );
  const texto = buf.toString("latin1");
  assert.match(texto, /Ap 302/);
  assert.match(texto, /Dinheiro/, "o banco grava em ingles; o cupom tem de sair em portugues");
  assert.match(texto, /Troco    45,00/, "o troco e o que volta pro cliente, nao o valor entregue");
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
