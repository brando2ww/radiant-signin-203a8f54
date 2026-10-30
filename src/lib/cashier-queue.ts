/** Um item salvo já é consumo, mesmo quando não passa pela cozinha. */
export function billableComandas<T extends { id: string; status: string }>(
  comandas: T[],
  items: { comanda_id: string; quantity: number; parent_item_id?: string | null; is_composite_child?: boolean }[],
): T[] {
  const withItems = new Set(items
    .filter((item) => item.quantity > 0 && !item.parent_item_id && !item.is_composite_child)
    .map((item) => item.comanda_id));
  return comandas.filter((comanda) =>
    comanda.status === "em_cobranca" || comanda.status === "aguardando_pagamento" ||
    (comanda.status === "aberta" && withItems.has(comanda.id)));
}
