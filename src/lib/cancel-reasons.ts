export type CancelCategory =
  | "cliente_desistiu"
  | "pedido_errado"
  | "problema_cozinha"
  | "demora_excessiva"
  | "item_indisponivel"
  | "outro";

export const CANCEL_CATEGORIES: { value: CancelCategory; label: string }[] = [
  { value: "cliente_desistiu", label: "Cliente desistiu" },
  { value: "pedido_errado", label: "Pedido errado" },
  { value: "problema_cozinha", label: "Problema na cozinha" },
  { value: "demora_excessiva", label: "Demora excessiva" },
  { value: "item_indisponivel", label: "Item indisponível" },
  { value: "outro", label: "Outro" },
];

export const CANCEL_CATEGORY_LABEL: Record<CancelCategory, string> =
  CANCEL_CATEGORIES.reduce((acc, c) => {
    acc[c.value] = c.label;
    return acc;
  }, {} as Record<CancelCategory, string>);

export function getCancelCategoryLabel(value?: string | null): string {
  if (!value) return "—";
  return (CANCEL_CATEGORY_LABEL as Record<string, string>)[value] || value;
}

export const MIN_CANCEL_REASON_LENGTH = 20;
