// Centralized data source for PDV reports.
//
// Background: `pdv_orders.total` and `pdv_orders.subtotal` are stored as 0 in
// this system. The actual revenue is recorded in `pdv_payments.amount`
// (settled money) and item-level data lives in `pdv_comanda_items`
// (linked via `pdv_comandas.order_id`).
//
// All revenue numbers in reports should come from `pdv_payments`. Item-level
// breakdowns (categories, products, quantities) should come from
// `pdv_comanda_items`.

import { supabase } from "@/integrations/supabase/client";

export interface OrderRevenue {
  total: number;
  byMethod: Record<string, number>;
  paidAt: string | null; // earliest processed_at
  processedBy: string | null; // first non-null processed_by
}

export async function fetchPaymentsByOrderIds(
  orderIds: string[]
): Promise<Map<string, OrderRevenue>> {
  const map = new Map<string, OrderRevenue>();
  if (!orderIds.length) return map;

  // Supabase has a 1000 row default; chunk just in case
  const chunkSize = 500;
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("pdv_payments")
      .select("order_id, payment_method, amount, processed_at, processed_by")
      .in("order_id", chunk);
    if (error) throw error;
    (data || []).forEach((p: any) => {
      const id = p.order_id as string;
      if (!map.has(id)) {
        map.set(id, { total: 0, byMethod: {}, paidAt: null, processedBy: null });
      }
      const r = map.get(id)!;
      const amt = Number(p.amount || 0);
      r.total += amt;
      const m = p.payment_method || "outros";
      r.byMethod[m] = (r.byMethod[m] || 0) + amt;
      if (p.processed_at && (!r.paidAt || p.processed_at < r.paidAt)) {
        r.paidAt = p.processed_at;
      }
      if (!r.processedBy && p.processed_by) r.processedBy = p.processed_by;
    });
  }
  return map;
}

export interface OrderItemAgg {
  quantity: number;
  revenue: number; // sum of comanda_item.subtotal
}

export async function fetchItemsByOrderIds(orderIds: string[]): Promise<
  Array<{
    order_id: string;
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>
> {
  if (!orderIds.length) return [];
  const chunkSize = 200;
  const all: any[] = [];
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("pdv_comanda_items")
      .select(
        "product_id, product_name, quantity, unit_price, subtotal, comanda:pdv_comandas!inner(order_id)"
      )
      .in("comanda.order_id", chunk);
    if (error) throw error;
    (data || []).forEach((it: any) => {
      all.push({
        order_id: it.comanda?.order_id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
        subtotal: Number(it.subtotal || 0),
      });
    });
  }
  return all;
}

export function aggregateItemsByOrder(
  items: Array<{ order_id: string; quantity: number; subtotal: number }>
): Map<string, OrderItemAgg> {
  const map = new Map<string, OrderItemAgg>();
  items.forEach((it) => {
    if (!it.order_id) return;
    if (!map.has(it.order_id)) map.set(it.order_id, { quantity: 0, revenue: 0 });
    const r = map.get(it.order_id)!;
    r.quantity += it.quantity;
    r.revenue += it.subtotal;
  });
  return map;
}

/**
 * Returns the order's "effective time" for period filtering.
 * Uses closed_at if present, otherwise opened_at.
 */
export function orderEffectiveTime(o: {
  closed_at?: string | null;
  opened_at?: string | null;
}): string | null {
  return o.closed_at || o.opened_at || null;
}
