/**
 * Mapeia chaves de método de pagamento usadas em diferentes camadas do app
 * para a chave canônica usada no catálogo de taxas (pdv_payment_method_fees).
 *
 * - PDV interno usa pt-BR: "dinheiro", "credito", "debito", "pix", "vale_refeicao", "cartao".
 * - Financeiro / delivery podem usar en: "cash", "credit", "debit", "pix", "voucher", "ifood".
 *
 * O catálogo armazena as chaves em formato livre (slug). Para alinhar, adotamos
 * en-US como canônico: cash, credit, debit, pix, voucher, ifood, ...
 */

const MAP: Record<string, string> = {
  dinheiro: "cash",
  cash: "cash",
  money: "cash",

  credito: "credit",
  cartao: "credit", // legado: cartão genérico = crédito
  credit: "credit",
  "credit-card": "credit",
  credit_card: "credit",

  debito: "debit",
  debit: "debit",
  "debit-card": "debit",
  debit_card: "debit",

  pix: "pix",

  vale_refeicao: "voucher",
  vale: "voucher",
  voucher: "voucher",
  ticket: "voucher",
  vr: "voucher",

  ifood: "ifood",
  rappi: "rappi",
  uber: "uber_eats",
  uber_eats: "uber_eats",
};

export function canonicalPaymentMethodKey(method: string | null | undefined): string {
  if (!method) return "cash";
  const k = method.toString().trim().toLowerCase();
  return MAP[k] ?? k;
}

export const PT_PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  credit: "Crédito",
  debit: "Débito",
  voucher: "Vale-refeição",
  ifood: "iFood",
  rappi: "Rappi",
  uber_eats: "Uber Eats",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  const key = canonicalPaymentMethodKey(method);
  return PT_PAYMENT_METHOD_LABELS[key] ?? key;
}
