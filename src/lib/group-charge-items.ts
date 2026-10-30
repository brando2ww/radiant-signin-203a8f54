export interface ChargeLine {
  id: string;
  product_id?: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes?: string | null;
  parent_item_id?: string | null;
  is_composite_child?: boolean | null;
}

/** Agrupa a apresentação; IDs, pagamentos parciais e lançamentos continuam individuais. */
export function groupChargeItems<T extends ChargeLine>(items: T[]) {
  const groups = new Map<string, { item: T; members: T[]; quantity: number; subtotal: number }>();
  for (const item of items) {
    const children = items.filter((child) => child.parent_item_id === item.id)
      .map((child) => [child.product_id || child.product_name, child.quantity / item.quantity, child.notes || ""])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const key = JSON.stringify([
      item.product_id || item.product_name, item.product_name, Number(item.unit_price),
      item.notes?.trim() || "", item.parent_item_id || "", !!item.is_composite_child, children,
    ]);
    const group = groups.get(key);
    if (group) {
      group.members.push(item);
      group.quantity += Number(item.quantity);
      group.subtotal = Math.round((group.subtotal + Number(item.subtotal)) * 100) / 100;
    } else groups.set(key, { item, members: [item], quantity: Number(item.quantity), subtotal: Number(item.subtotal) });
  }
  return [...groups.values()];
}
