/**
 * Prêmio de fidelidade: produto ou desconto.
 *
 * O cálculo do desconto vive aqui porque acontece em três lugares que precisam
 * concordar — a vitrine de prêmios, o carrinho e a função do banco que aplica
 * no pedido. Os dois primeiros são só previsão; quem decide é o servidor, em
 * `delivery_apply_redemption`. Se estas contas divergirem, o cliente vê um
 * valor e paga outro.
 */

export type PrizeKind = "product" | "discount";
export type PrizeDiscountType = "fixed" | "percentage";

export interface PrizeDiscountSpec {
  discount_type?: PrizeDiscountType | string | null;
  discount_value?: number | string | null;
  discount_max?: number | string | null;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Quanto este prêmio abate de um subtotal. Espelha, em TypeScript, o bloco
 * `if v_red.kind = 'discount'` da função do banco: percentual com teto,
 * nunca acima do subtotal, arredondado em centavos.
 */
export function computePrizeDiscount(prize: PrizeDiscountSpec, subtotal: number): number {
  const base = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  let amount: number;

  if (prize.discount_type === "percentage") {
    amount = (base * num(prize.discount_value)) / 100;
    const cap = prize.discount_max == null ? null : num(prize.discount_max);
    if (cap != null && cap > 0 && amount > cap) amount = cap;
  } else {
    amount = num(prize.discount_value);
  }

  if (amount > base) amount = base;
  return Math.round(Math.max(amount, 0) * 100) / 100;
}

/** Rótulo do prêmio na vitrine: "R$ 20,00 de desconto", "10% de desconto". */
export function describePrizeDiscount(prize: PrizeDiscountSpec): string {
  if (prize.discount_type === "percentage") {
    const cap = prize.discount_max == null ? null : num(prize.discount_max);
    const pct = num(prize.discount_value);
    const base = `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% de desconto`;
    return cap && cap > 0
      ? `${base} (até ${cap.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`
      : base;
  }
  const v = num(prize.discount_value);
  return `${v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto`;
}
