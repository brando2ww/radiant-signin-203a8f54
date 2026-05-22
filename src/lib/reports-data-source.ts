// Centralized data source for PDV reports.
//
// Revenue source of truth: `pdv_cashier_movements` where type = 'venda',
// joined to `pdv_cashier_sessions` to scope by establishment owner. This
// includes BOTH salão/balcão sales and delivery sales (source = 'delivery'),
// and is the only column that reflects every receivable in this system.
//
// `pdv_orders.total` / `pdv_orders.subtotal` are stored as 0 and must not be
// used. `pdv_payments` is also incomplete (covers only part of the operation).
// Item-level breakdowns still come from `pdv_comanda_items` (linked via
// `pdv_comandas.order_id`) and `delivery_order_items`.

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

// ===== Cashier-based revenue (single source of truth) =====

export interface CashierMovement {
  amount: number;
  payment_method: string | null;
  source: string | null; // 'salao' | 'salon' | 'balcao' | 'delivery' | null
  delivery_order_id: string | null;
  created_at: string;
  description: string | null;
}

/**
 * Fetches all "venda" cashier movements for the given owner in a date range.
 * Joins through pdv_cashier_sessions to filter by user_id.
 */
export async function fetchCashierSalesByPeriod(
  ownerUserId: string,
  startISO: string,
  endISO: string,
): Promise<CashierMovement[]> {
  // 1) Sessions for this owner intersecting the window (paged)
  const sessionIds: string[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("pdv_cashier_sessions")
      .select("id")
      .eq("user_id", ownerUserId)
      .lte("opened_at", endISO)
      .or(`closed_at.is.null,closed_at.gte.${startISO}`)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const ids = (data || []).map((s: any) => s.id);
    sessionIds.push(...ids);
    if (ids.length < pageSize) break;
    from += pageSize;
  }
  if (!sessionIds.length) return [];

  // 2) Movements in those sessions within the window (paged + chunked)
  const out: CashierMovement[] = [];
  const sessionChunk = 200;
  for (let i = 0; i < sessionIds.length; i += sessionChunk) {
    const chunk = sessionIds.slice(i, i + sessionChunk);
    let f = 0;
    while (true) {
      const { data, error } = await supabase
        .from("pdv_cashier_movements")
        .select("amount, payment_method, source, delivery_order_id, created_at, description")
        .in("cashier_session_id", chunk)
        .eq("type", "venda")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .range(f, f + pageSize - 1);
      if (error) throw error;
      const rows = (data || []) as any[];
      out.push(
        ...rows.map((r) => ({
          amount: Number(r.amount || 0),
          payment_method: r.payment_method,
          source: r.source,
          delivery_order_id: r.delivery_order_id,
          created_at: r.created_at,
          description: r.description,
        })),
      );
      if (rows.length < pageSize) break;
      f += pageSize;
    }
  }
  return out;
}

/** Maps any source value to one of three buckets used in dashboards. */
export function channelOfSource(source: string | null | undefined): "salao" | "balcao" | "delivery" {
  const s = (source || "").toLowerCase();
  if (s === "delivery") return "delivery";
  if (s === "balcao") return "balcao";
  return "salao"; // 'salon', 'salao', empty, anything else
}

