// Montagem do payload de NFC-e enviado à FocusNFE.
//
// Isolado da edge function porque a aritmética fiscal é a parte que a SEFAZ
// rejeita quando está errada, e precisa de teste unitário: a identidade
//
//   Σ(bruto dos itens) − Σ(descontos) + frete + outras despesas = Σ(pagamentos)
//
// tem que fechar em centavos. Toda a conta é feita em inteiros (centavos) —
// somar float de dinheiro produz 0.30000000000000004 e derruba a validação.

export interface NFCeItemInput {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  ncm?: string | null;
  cfop?: string | null;
  cest?: string | null;
  ean?: string | null;
  unidade?: string | null;
  origem?: string | number | null;
  csosn?: string | null;
  cst_icms?: string | null;
  icms_rate?: number | null;
  pis_cst?: string | null;
  pis_rate?: number | null;
  cofins_cst?: string | null;
  cofins_rate?: number | null;
}

export interface PagamentoInput {
  /** Código da tabela do SEFAZ (01 dinheiro, 03 crédito, 04 débito, 17 pix...). */
  forma_pagamento: string;
  valor: number;
  bandeira?: string | null;
  parcelas?: number | null;
}

export interface FiscalDefaults {
  /** 1 = Simples Nacional (usa CSOSN), demais usam CST. */
  regime_tributario?: number | null;
  cst_csosn?: string | null;
  cfop?: string | null;
  icms_rate?: number | null;
  pis_rate?: number | null;
  cofins_rate?: number | null;
}

export interface BuildNFCeParams {
  items: NFCeItemInput[];
  valor_desconto?: number;
  valor_frete?: number;
  valor_outras_despesas?: number;
  pagamentos: PagamentoInput[];
  customer?: { cpf?: string | null; nome?: string | null; email?: string | null } | null;
  cnpj_emitente: string;
  serie: string | number;
  defaults?: FiscalDefaults;
  /** true = venda no balcão/salão; false = entrega a domicílio (delivery). */
  presencial?: boolean;
  informacoes_adicionais?: string | null;
}

// ---------------------------------------------------------------- utilidades

/** Converte reais em centavos sem o erro de arredondamento do float binário. */
export function toCents(v: number | null | undefined): number {
  if (!v || !isFinite(v)) return 0;
  return Math.round(v * 100);
}

export function fromCents(c: number): number {
  return Math.round(c) / 100;
}

/**
 * Rateia um desconto total entre os itens, proporcionalmente ao valor bruto de
 * cada um.
 *
 * O resto da divisão é distribuído centavo a centavo, começando pelos itens de
 * maior parte fracionária — assim a soma dos rateios é exatamente igual ao
 * desconto original, que é o que a SEFAZ valida. Um desconto de R$ 10,00 em 3
 * itens iguais vira 334 + 333 + 333, nunca 333 + 333 + 333.
 */
export function rateiaDesconto(brutosCents: number[], descontoCents: number): number[] {
  const n = brutosCents.length;
  const zeros = new Array(n).fill(0);
  if (descontoCents <= 0 || n === 0) return zeros;

  const totalBruto = brutosCents.reduce((s, v) => s + v, 0);
  if (totalBruto <= 0) return zeros;

  // Desconto nunca pode superar o valor da mercadoria.
  const desconto = Math.min(descontoCents, totalBruto);

  const exatos = brutosCents.map((b) => (desconto * b) / totalBruto);
  const base = exatos.map((v) => Math.floor(v));
  let resto = desconto - base.reduce((s, v) => s + v, 0);

  // Maior parte fracionária primeiro; empate resolvido pelo índice para manter
  // o resultado determinístico (importante para o teste e para reemissões).
  const ordem = exatos
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));

  const out = [...base];
  let k = 0;
  while (resto > 0 && ordem.length > 0) {
    const idx = ordem[k % ordem.length].i;
    // Não deixa o desconto de um item ultrapassar o próprio item.
    if (out[idx] < brutosCents[idx]) {
      out[idx] += 1;
      resto -= 1;
    }
    k += 1;
    // Salvaguarda: se todos os itens estourarem o teto, não trava o laço.
    if (k > n * 2 && out.every((v, i) => v >= brutosCents[i])) break;
  }

  return out;
}

/** CSOSN/CST que exigem base de cálculo e alíquota de ICMS destacadas. */
const ICMS_TRIBUTADO = new Set(["00", "10", "20", "51", "70", "90", "101", "900"]);
/** CST de PIS/COFINS que exigem alíquota. */
const PISCOFINS_TRIBUTADO = new Set(["01", "02", "05"]);

function digits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function firstNonEmpty(...vals: Array<unknown>): string | undefined {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return undefined;
}

// ---------------------------------------------------------------- validação

export interface ValidationIssue {
  product_name: string;
  motivo: string;
}

/**
 * Confere o que a SEFAZ recusaria, antes de gastar um número da série.
 *
 * Uma NFC-e rejeitada consome numeração e obriga inutilização posterior, então
 * é melhor barrar aqui e devolver uma mensagem que o operador entende ("produto
 * X sem NCM") do que repassar o erro cru do SEFAZ.
 */
export function validarItens(
  items: NFCeItemInput[],
  defaults?: FiscalDefaults,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cfopPadrao = firstNonEmpty(defaults?.cfop);

  for (const it of items) {
    const nome = it.product_name || "(sem nome)";
    const ncm = digits(it.ncm);
    if (ncm.length !== 8) {
      issues.push({ product_name: nome, motivo: "sem NCM válido (8 dígitos)" });
    }
    const cfop = digits(firstNonEmpty(it.cfop, cfopPadrao));
    if (cfop.length !== 4) {
      issues.push({ product_name: nome, motivo: "sem CFOP válido (4 dígitos)" });
    }
    if (!(it.quantity > 0)) {
      issues.push({ product_name: nome, motivo: "quantidade inválida" });
    }
    if (!(it.unit_price >= 0)) {
      issues.push({ product_name: nome, motivo: "preço unitário inválido" });
    }
  }
  return issues;
}

// ---------------------------------------------------------------- construção

export interface BuiltNFCe {
  payload: Record<string, unknown>;
  totais: {
    valor_produtos: number;
    valor_desconto: number;
    valor_frete: number;
    valor_outras_despesas: number;
    valor_total: number;
    valor_pago: number;
  };
}

export function buildNFCePayload(params: BuildNFCeParams): BuiltNFCe {
  const {
    items,
    customer,
    cnpj_emitente,
    serie,
    defaults = {},
    presencial = true,
    informacoes_adicionais,
  } = params;

  const simplesNacional = (defaults.regime_tributario ?? 1) === 1;

  // --- valores, tudo em centavos
  const brutos = items.map((it) => toCents(it.quantity * it.unit_price));
  const totalBrutoC = brutos.reduce((s, v) => s + v, 0);

  const descontoC = Math.min(toCents(params.valor_desconto), totalBrutoC);
  const freteC = toCents(params.valor_frete);
  const outrasC = toCents(params.valor_outras_despesas);
  const descontosPorItem = rateiaDesconto(brutos, descontoC);

  const totalC = totalBrutoC - descontoC + freteC + outrasC;

  // --- pagamentos: a soma tem que bater com o total da nota.
  // O caixa registra o valor entregue pelo cliente (com troco); o que vai na
  // nota é o valor efetivamente pago. Ajustamos a última linha para fechar.
  const pagamentos: PagamentoInput[] = params.pagamentos.length > 0
    ? [...params.pagamentos]
    : [{ forma_pagamento: "01", valor: fromCents(totalC) }];

  const pagC = pagamentos.map((p) => toCents(p.valor));
  const somaPagC = pagC.reduce((s, v) => s + v, 0);
  if (somaPagC !== totalC) {
    const ajuste = totalC - somaPagC;
    pagC[pagC.length - 1] = Math.max(0, pagC[pagC.length - 1] + ajuste);
  }

  // --- itens
  const cfopPadrao = firstNonEmpty(defaults.cfop) || "5102";
  const cstPadrao = firstNonEmpty(defaults.cst_csosn) || (simplesNacional ? "102" : "00");

  const payloadItems = items.map((it, idx) => {
    const brutoC = brutos[idx];
    const descItemC = descontosPorItem[idx];

    const situacao = firstNonEmpty(
      simplesNacional ? it.csosn : it.cst_icms,
      simplesNacional ? it.cst_icms : it.csosn,
      cstPadrao,
    )!;

    const item: Record<string, unknown> = {
      numero_item: idx + 1,
      codigo_produto: it.product_id ? String(it.product_id).slice(0, 60) : `P${idx + 1}`,
      descricao: (it.product_name || "Item").slice(0, 120),
      codigo_ncm: digits(it.ncm),
      cfop: digits(firstNonEmpty(it.cfop, cfopPadrao)),
      unidade_comercial: (firstNonEmpty(it.unidade) || "UN").toUpperCase().slice(0, 6),
      quantidade_comercial: it.quantity,
      valor_unitario_comercial: it.unit_price,
      valor_bruto: fromCents(brutoC),
      unidade_tributavel: (firstNonEmpty(it.unidade) || "UN").toUpperCase().slice(0, 6),
      quantidade_tributavel: it.quantity,
      valor_unitario_tributavel: it.unit_price,
      codigo_ean: firstNonEmpty(it.ean) || "SEM GTIN",
      codigo_ean_tributavel: firstNonEmpty(it.ean) || "SEM GTIN",
      // A Focus lê a origem da mercadoria como `icms_origem`. Enviar `origem`
      // era ignorado silenciosamente e a SEFAZ rejeitava toda nota por falta
      // do campo, mesmo com o produto tendo origem cadastrada.
      icms_origem: Number(digits(it.origem ?? "0") || "0"),
      inclui_no_total: 1,
      icms_situacao_tributaria: situacao,
    };

    if (descItemC > 0) item.valor_desconto = fromCents(descItemC);
    const cest = digits(it.cest);
    if (cest.length === 7) item.cest = cest;

    // ICMS destacado só nas situações que exigem — mandar base/alíquota numa
    // CSOSN 102 (Simples sem permissão de crédito) é rejeição na hora.
    if (ICMS_TRIBUTADO.has(situacao)) {
      const aliq = Number(it.icms_rate ?? defaults.icms_rate ?? 0);
      item.icms_modalidade_base_calculo = 3;
      item.icms_base_calculo = fromCents(brutoC - descItemC);
      item.icms_aliquota = aliq;
      item.icms_valor = fromCents(Math.round(((brutoC - descItemC) * aliq) / 100));
    }

    const pisCst = firstNonEmpty(it.pis_cst) || (simplesNacional ? "07" : "01");
    const cofinsCst = firstNonEmpty(it.cofins_cst) || (simplesNacional ? "07" : "01");
    item.pis_situacao_tributaria = pisCst;
    item.cofins_situacao_tributaria = cofinsCst;

    if (PISCOFINS_TRIBUTADO.has(pisCst)) {
      const aliq = Number(it.pis_rate ?? defaults.pis_rate ?? 0);
      item.pis_base_calculo = fromCents(brutoC - descItemC);
      item.pis_aliquota_porcentual = aliq;
      item.pis_valor = fromCents(Math.round(((brutoC - descItemC) * aliq) / 100));
    }
    if (PISCOFINS_TRIBUTADO.has(cofinsCst)) {
      const aliq = Number(it.cofins_rate ?? defaults.cofins_rate ?? 0);
      item.cofins_base_calculo = fromCents(brutoC - descItemC);
      item.cofins_aliquota_porcentual = aliq;
      item.cofins_valor = fromCents(Math.round(((brutoC - descItemC) * aliq) / 100));
    }

    return item;
  });

  // --- pagamentos no formato Focus
  const formasPagamento = pagamentos.map((p, i) => {
    const linha: Record<string, unknown> = {
      forma_pagamento: p.forma_pagamento,
      valor_pagamento: fromCents(pagC[i] ?? 0),
    };
    // Cartão exige credenciadora/bandeira quando informados.
    if (p.bandeira) linha.bandeira_operadora = p.bandeira;
    if (p.parcelas && p.parcelas > 1) linha.numero_parcelas = p.parcelas;
    return linha;
  });

  const cpf = digits(customer?.cpf);

  const payload: Record<string, unknown> = {
    natureza_operacao: "Venda ao consumidor",
    data_emissao: new Date().toISOString(),
    serie: String(serie || 1),
    tipo_documento: 1,
    local_destino: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    // 1 = operação presencial; 4 = entrega a domicílio (delivery).
    presenca_comprador: presencial ? 1 : 4,
    modalidade_frete: freteC > 0 ? 0 : 9,
    cnpj_emitente: digits(cnpj_emitente),
    items: payloadItems,
    formas_pagamento: formasPagamento,
    valor_produtos: fromCents(totalBrutoC),
    valor_desconto: fromCents(descontoC),
    valor_frete: fromCents(freteC),
    valor_outras_despesas: fromCents(outrasC),
    valor_seguro: 0,
    valor_total: fromCents(totalC),
  };

  if (cpf.length === 11) payload.cpf_destinatario = cpf;
  const nome = firstNonEmpty(customer?.nome);
  if (nome) payload.nome_destinatario = nome.slice(0, 60);
  const email = firstNonEmpty(customer?.email);
  if (email) payload.email_destinatario = email;
  const info = firstNonEmpty(informacoes_adicionais);
  if (info) payload.informacoes_adicionais_contribuinte = info.slice(0, 500);

  return {
    payload,
    totais: {
      valor_produtos: fromCents(totalBrutoC),
      valor_desconto: fromCents(descontoC),
      valor_frete: fromCents(freteC),
      valor_outras_despesas: fromCents(outrasC),
      valor_total: fromCents(totalC),
      valor_pago: fromCents(pagC.reduce((s, v) => s + v, 0)),
    },
  };
}

/**
 * Traduz a forma de pagamento do PDV para o código da tabela do SEFAZ.
 * O banco grava tanto em português quanto em inglês, dependendo da origem
 * (caixa, delivery, integrações), então o mapa aceita os dois.
 */
export function mapFormaPagamento(metodo: string | null | undefined): string {
  const m = String(metodo ?? "").toLowerCase().trim();
  const mapa: Record<string, string> = {
    dinheiro: "01", cash: "01", money: "01",
    cheque: "02",
    credito: "03", credit: "03", cartao_credito: "03", credit_card: "03",
    debito: "04", debit: "04", cartao_debito: "04", debit_card: "04",
    cartao: "03", card: "03",
    vale_refeicao: "10", voucher: "10", ticket: "10",
    vale_alimentacao: "11",
    boleto: "15",
    pix: "17",
    online: "99", outros: "99",
  };
  return mapa[m] || "99";
}
