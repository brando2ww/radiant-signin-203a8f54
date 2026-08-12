// Testes da aritmética fiscal da NFC-e.
//
// Rodar com: deno test supabase/functions/_shared/nfce-payload.test.ts
//
// A invariante que a SEFAZ valida é
//   Σ(bruto) − Σ(descontos) + frete + outras = Σ(pagamentos)
// e é ela que quebrava antes: os itens iam a preço cheio e o pagamento vinha
// com o valor já descontado.

import { assertEquals } from "jsr:@std/assert@1";
import {
  buildNFCePayload,
  mapFormaPagamento,
  rateiaDesconto,
  toCents,
  validarItens,
} from "./nfce-payload.ts";

const item = (nome: string, qtd: number, preco: number, extra: Record<string, unknown> = {}) => ({
  product_name: nome,
  quantity: qtd,
  unit_price: preco,
  ncm: "22011000",
  cfop: "5102",
  ...extra,
});

// ------------------------------------------------------------------ rateio

Deno.test("rateio: desconto que não divide igual não perde nem cria centavo", () => {
  const brutos = [1000, 1000, 1000]; // 3 itens de R$ 10,00
  const r = rateiaDesconto(brutos, 1000); // R$ 10,00 de desconto
  assertEquals(r.reduce((s, v) => s + v, 0), 1000);
  assertEquals(r, [334, 333, 333]);
});

Deno.test("rateio: proporcional ao valor de cada item", () => {
  const brutos = [8000, 2000]; // R$ 80 e R$ 20
  const r = rateiaDesconto(brutos, 1000); // R$ 10
  assertEquals(r, [800, 200]);
});

Deno.test("rateio: desconto maior que o total é limitado ao total", () => {
  const brutos = [500, 500];
  const r = rateiaDesconto(brutos, 5000);
  assertEquals(r.reduce((s, v) => s + v, 0), 1000);
});

Deno.test("rateio: desconto zero não aloca nada", () => {
  assertEquals(rateiaDesconto([1000, 2000], 0), [0, 0]);
});

Deno.test("rateio: nenhum item recebe desconto maior que ele mesmo", () => {
  const brutos = [100, 9900];
  const r = rateiaDesconto(brutos, 9950);
  assertEquals(r[0] <= brutos[0], true);
  assertEquals(r[1] <= brutos[1], true);
  assertEquals(r.reduce((s, v) => s + v, 0), 9950);
});

// -------------------------------------------------------------- invariante

function somaPagamentos(payload: Record<string, unknown>): number {
  const formas = payload.formas_pagamento as Array<{ valor_pagamento: number }>;
  return formas.reduce((s, f) => s + toCents(f.valor_pagamento), 0);
}

function somaItens(payload: Record<string, unknown>): number {
  const items = payload.items as Array<{ valor_bruto: number; valor_desconto?: number }>;
  return items.reduce((s, i) => s + toCents(i.valor_bruto) - toCents(i.valor_desconto ?? 0), 0);
}

Deno.test("invariante: venda simples fecha", () => {
  const { payload } = buildNFCePayload({
    items: [item("Coca", 2, 8.5)],
    pagamentos: [{ forma_pagamento: "01", valor: 17 }],
    cnpj_emitente: "12345678000199",
    serie: 1,
  });
  assertEquals(somaItens(payload), somaPagamentos(payload));
  assertEquals(payload.valor_total, 17);
});

Deno.test("invariante: desconto que não divide igual fecha", () => {
  const { payload, totais } = buildNFCePayload({
    items: [item("A", 1, 10), item("B", 1, 10), item("C", 1, 10)],
    valor_desconto: 10,
    pagamentos: [{ forma_pagamento: "01", valor: 20 }],
    cnpj_emitente: "12345678000199",
    serie: 1,
  });
  assertEquals(totais.valor_total, 20);
  assertEquals(somaItens(payload), somaPagamentos(payload));
});

Deno.test("invariante: pedido com frete e desconto fecha", () => {
  const { payload, totais } = buildNFCePayload({
    items: [item("Pizza", 1, 45.9)],
    valor_desconto: 5,
    valor_frete: 8,
    pagamentos: [{ forma_pagamento: "17", valor: 48.9 }],
    cnpj_emitente: "12345678000199",
    serie: 1,
    presencial: false,
  });
  assertEquals(totais.valor_total, 48.9);
  assertEquals(somaItens(payload) + toCents(48.9 - 45.9 + 5), somaPagamentos(payload));
  assertEquals(payload.modalidade_frete, 0);
  assertEquals(payload.presenca_comprador, 4); // entrega a domicílio
});

Deno.test("invariante: pagamento misto preserva as duas linhas e fecha", () => {
  const { payload } = buildNFCePayload({
    items: [item("Rodízio", 4, 89.9)],
    pagamentos: [
      { forma_pagamento: "01", valor: 100 },
      { forma_pagamento: "03", valor: 259.6 },
    ],
    cnpj_emitente: "12345678000199",
    serie: 1,
  });
  const formas = payload.formas_pagamento as unknown[];
  assertEquals(formas.length, 2);
  assertEquals(somaPagamentos(payload), toCents(359.6));
});

Deno.test("pagamento com troco: a nota registra o total, não o valor entregue", () => {
  // Cliente entrega R$ 50 numa venda de R$ 34,90 — a nota tem que dizer 34,90.
  const { payload } = buildNFCePayload({
    items: [item("Prato", 1, 34.9)],
    pagamentos: [{ forma_pagamento: "01", valor: 50 }],
    cnpj_emitente: "12345678000199",
    serie: 1,
  });
  assertEquals(somaPagamentos(payload), toCents(34.9));
});

// ------------------------------------------------------------------ impostos

Deno.test("CSOSN 102 não destaca base nem alíquota de ICMS", () => {
  const { payload } = buildNFCePayload({
    items: [item("Coca", 1, 10, { csosn: "102" })],
    pagamentos: [{ forma_pagamento: "01", valor: 10 }],
    cnpj_emitente: "12345678000199",
    serie: 1,
    defaults: { regime_tributario: 1 },
  });
  const it = (payload.items as Array<Record<string, unknown>>)[0];
  assertEquals(it.icms_situacao_tributaria, "102");
  assertEquals(it.icms_base_calculo, undefined);
  assertEquals(it.icms_aliquota, undefined);
});

Deno.test("CSOSN 900 destaca ICMS sobre a base já descontada", () => {
  const { payload } = buildNFCePayload({
    items: [item("Coca", 1, 100, { csosn: "900", icms_rate: 10 })],
    valor_desconto: 20,
    pagamentos: [{ forma_pagamento: "01", valor: 80 }],
    cnpj_emitente: "12345678000199",
    serie: 1,
    defaults: { regime_tributario: 1 },
  });
  const it = (payload.items as Array<Record<string, unknown>>)[0];
  assertEquals(it.icms_base_calculo, 80);
  assertEquals(it.icms_valor, 8);
});

Deno.test("produto sem CST usa o default do estabelecimento", () => {
  const { payload } = buildNFCePayload({
    items: [item("X", 1, 10, { csosn: "", cst_icms: "" })],
    pagamentos: [{ forma_pagamento: "01", valor: 10 }],
    cnpj_emitente: "12345678000199",
    serie: 1,
    defaults: { regime_tributario: 1, cst_csosn: "400" },
  });
  const it = (payload.items as Array<Record<string, unknown>>)[0];
  assertEquals(it.icms_situacao_tributaria, "400");
});

// ----------------------------------------------------------------- validação

Deno.test("validação: produto sem NCM é barrado antes da SEFAZ", () => {
  const issues = validarItens([item("Sem NCM", 1, 10, { ncm: "" })]);
  assertEquals(issues.length, 1);
  assertEquals(issues[0].product_name, "Sem NCM");
});

Deno.test("validação: NCM com menos de 8 dígitos é barrado", () => {
  const issues = validarItens([item("Curto", 1, 10, { ncm: "2201" })]);
  assertEquals(issues.length, 1);
});

Deno.test("validação: CFOP vem do default quando o produto não tem", () => {
  const issues = validarItens([item("X", 1, 10, { cfop: "" })], { cfop: "5102" });
  assertEquals(issues.length, 0);
});

Deno.test("validação: item completo passa", () => {
  assertEquals(validarItens([item("OK", 1, 10)]).length, 0);
});

// -------------------------------------------------------------- pagamentos

Deno.test("mapFormaPagamento aceita português e inglês", () => {
  assertEquals(mapFormaPagamento("dinheiro"), "01");
  assertEquals(mapFormaPagamento("cash"), "01");
  assertEquals(mapFormaPagamento("pix"), "17");
  assertEquals(mapFormaPagamento("credit"), "03");
  assertEquals(mapFormaPagamento("cartao_debito"), "04");
  assertEquals(mapFormaPagamento("coisa estranha"), "99");
});

// ------------------------------------------------------------------ destinatário

Deno.test("CPF só vai na nota quando tem 11 dígitos", () => {
  const comCpf = buildNFCePayload({
    items: [item("X", 1, 10)],
    pagamentos: [{ forma_pagamento: "01", valor: 10 }],
    customer: { cpf: "123.456.789-09" },
    cnpj_emitente: "12345678000199",
    serie: 1,
  }).payload;
  assertEquals(comCpf.cpf_destinatario, "12345678909");

  const semCpf = buildNFCePayload({
    items: [item("X", 1, 10)],
    pagamentos: [{ forma_pagamento: "01", valor: 10 }],
    customer: { cpf: "123" },
    cnpj_emitente: "12345678000199",
    serie: 1,
  }).payload;
  assertEquals(semCpf.cpf_destinatario, undefined);
});
