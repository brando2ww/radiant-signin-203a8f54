import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo } from "react";
import { differenceInCalendarDays, format } from "date-fns";

export type ChannelKey = "salao" | "balcao" | "delivery";

export interface ProductRow {
  product_id: string;
  product_name: string;
  category: string;
  is_composite: boolean;
  price: number;
  quantity: number;
  revenue: number;
  unit_cost: number;
  cmv: number;
  profit: number;
  margin: number; // %
  orders: number;
  avg_ticket_item: number;
  share: number; // 0..1
  abc: "A" | "B" | "C";
  delta_pct: number | null; // vs previous period revenue
  channels: Record<ChannelKey, { qty: number; revenue: number }>;
}

export interface CancelledItemRow {
  date: string;
  order_number: number | null;
  product_name: string;
  quantity: number;
  value: number;
  reason: string | null;
}

export interface ModifierRow { name: string; count: number; extra_revenue: number }
export interface KitRow { id: string; name: string; quantity: number; revenue: number; children: { name: string; quantity: number }[] }
export interface InactiveRow { id: string; name: string; category: string; price: number; days_since_last_sale: number | null }
export interface CoverageRow {
  product_name: string;
  ingredient_name: string;
  current_stock: number;
  unit: string;
  consumption_per_day: number;
  days_left: number | null;
  status: "ok" | "warn" | "danger";
}

export interface ProductAnalyticsParams {
  start: Date;
  end: Date;
  channels?: ChannelKey[]; // default all
}

export interface ProductAnalytics {
  rows: ProductRow[];
  totals: {
    products: number;
    qty: number;
    revenue: number;
    cmv: number;
    profit: number;
    margin: number;
    orders: number;
    avg_ticket_item: number;
  };
  abc: {
    A: { count: number; revenue: number; share: number };
    B: { count: number; revenue: number; share: number };
    C: { count: number; revenue: number; share: number };
  };
  hourHeat: number[][]; // [day 0..6][hour 0..23] = qty
  dailySeries: { date: string; total: number; perProduct: Record<string, number> }[];
  cancelled: { product_id: string; product_name: string; quantity: number; value: number; orders: number }[];
  cancelledDetails: CancelledItemRow[];
  modifiers: ModifierRow[];
  kits: KitRow[];
  inactive: InactiveRow[];
  coverage: CoverageRow[];
}

const dayBoundaries = (start: Date, end: Date) => {
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(23, 59, 59, 999);
  return { s, e };
};

const buildUnitCostResolver = (
  recipes: any[],
  comps: any[],
  productIds: string[],
) => {
  const recipeCost: Record<string, number> = {};
  recipes.forEach((r: any) => {
    const c = Number(r.quantity) * Number(r.pdv_ingredients?.unit_cost || 0);
    recipeCost[r.product_id] = (recipeCost[r.product_id] || 0) + c;
  });
  const compMap: Record<string, { child_product_id: string; quantity: number }[]> = {};
  comps.forEach((c: any) => {
    if (!compMap[c.parent_product_id]) compMap[c.parent_product_id] = [];
    compMap[c.parent_product_id].push({ child_product_id: c.child_product_id, quantity: Number(c.quantity) || 0 });
  });
  const memo = new Map<string, number>();
  const cost = (pid: string, visited: Set<string>): number => {
    if (!pid) return 0;
    if (visited.has(pid)) return 0;
    if (memo.has(pid)) return memo.get(pid)!;
    visited.add(pid);
    const r = recipeCost[pid] || 0;
    let cc = 0;
    for (const ch of (compMap[pid] || [])) cc += ch.quantity * cost(ch.child_product_id, new Set(visited));
    const total = r + cc;
    memo.set(pid, total);
    return total;
  };
  productIds.forEach((id) => cost(id, new Set()));
  return { cost, recipeCost, compMap };
};

export function useProductAnalytics(params: ProductAnalyticsParams) {
  const { visibleUserId } = useEstablishmentId();
  const channels = params.channels && params.channels.length ? params.channels : (["salao", "balcao", "delivery"] as ChannelKey[]);
  const { s: startISO, e: endISO } = useMemo(() => {
    const { s, e } = dayBoundaries(params.start, params.end);
    return { s: s.toISOString(), e: e.toISOString() };
  }, [params.start, params.end]);

  // Previous period (same length, immediately before)
  const { prevStartISO, prevEndISO } = useMemo(() => {
    const { s, e } = dayBoundaries(params.start, params.end);
    const days = differenceInCalendarDays(e, s) + 1;
    const prevEnd = new Date(s); prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1); prevStart.setHours(0, 0, 0, 0);
    return { prevStartISO: prevStart.toISOString(), prevEndISO: prevEnd.toISOString() };
  }, [params.start, params.end]);

  return useQuery({
    queryKey: ["product-analytics", visibleUserId, startISO, endISO, channels.join(",")],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<ProductAnalytics> => {
      // 1. Catalog
      const { data: products } = await supabase
        .from("pdv_products")
        .select("id, name, category, price_salon, price_balcao, price_delivery, is_composite")
        .eq("user_id", visibleUserId!);
      const productIds = (products || []).map((p) => p.id);
      const productMap = new Map((products || []).map((p) => [p.id, p]));

      // 2. PDV items in period — items live in pdv_comanda_items, linked via pdv_comandas.order_id
      const wantPdv = channels.includes("salao") || channels.includes("balcao");
      const { data: pdvItems } = wantPdv
        ? await supabase
          .from("pdv_comanda_items")
          .select("product_id, product_name, quantity, subtotal, modifiers, created_at, comanda:pdv_comandas!inner(order_id, created_at, order:pdv_orders!inner(id, order_number, user_id, status, source, closed_at, opened_at))")
          .eq("comanda.order.user_id", visibleUserId!)
          .in("comanda.order.status", ["fechada", "fechado"])
          .gte("comanda.created_at", startISO)
          .lte("comanda.created_at", endISO)
        : { data: [] as any[] };

      // 3. Delivery items
      const { data: delItems } = channels.includes("delivery")
        ? await supabase
          .from("delivery_order_items")
          .select("product_id, product_name, quantity, subtotal, order:delivery_orders!inner(id, user_id, status, delivered_at)")
          .eq("order.user_id", visibleUserId!)
          .eq("order.status", "entregue")
          .gte("order.delivered_at", startISO)
          .lte("order.delivered_at", endISO)
        : { data: [] as any[] };

      // 4. Previous-period revenue per product (for delta) — combined PDV+delivery
      const { data: prevPdv } = wantPdv
        ? await supabase
          .from("pdv_comanda_items")
          .select("product_id, subtotal, comanda:pdv_comandas!inner(created_at, order:pdv_orders!inner(user_id, status))")
          .eq("comanda.order.user_id", visibleUserId!)
          .in("comanda.order.status", ["fechada", "fechado"])
          .gte("comanda.created_at", prevStartISO)
          .lte("comanda.created_at", prevEndISO)
        : { data: [] as any[] };
      const { data: prevDel } = channels.includes("delivery")
        ? await supabase
          .from("delivery_order_items")
          .select("product_id, subtotal, order:delivery_orders!inner(user_id, status, delivered_at)")
          .eq("order.user_id", visibleUserId!)
          .eq("order.status", "entregue")
          .gte("order.delivered_at", prevStartISO)
          .lte("order.delivered_at", prevEndISO)
        : { data: [] as any[] };
      const prevRevByProduct = new Map<string, number>();
      [...(prevPdv || []), ...(prevDel || [])].forEach((it: any) => {
        const k = it.product_id;
        if (!k) return;
        prevRevByProduct.set(k, (prevRevByProduct.get(k) || 0) + Number(it.subtotal || 0));
      });

      // 5. Recipes + compositions for cost
      const { data: recipes } = await supabase
        .from("pdv_product_recipes")
        .select("product_id, quantity, pdv_ingredients(id, name, unit, unit_cost, current_stock, category)");
      const { data: comps } = productIds.length
        ? await supabase.from("pdv_product_compositions").select("parent_product_id, child_product_id, quantity").in("parent_product_id", productIds)
        : { data: [] as any[] };
      const { cost: unitCostOf, compMap } = buildUnitCostResolver(recipes || [], comps || [], productIds);

      // 6. Cancelled PDV items in period
      const { data: cancelledOrders } = await supabase
        .from("pdv_orders")
        .select("id, order_number, cancellation_reason, cancelled_at, pdv_order_items(product_id, product_name, quantity, subtotal)")
        .eq("user_id", visibleUserId!)
        .eq("status", "cancelada")
        .gte("cancelled_at", startISO)
        .lte("cancelled_at", endISO);

      // 7. Ingredients for coverage
      const ingredientMap = new Map<string, any>();
      (recipes || []).forEach((r: any) => {
        const ing = r.pdv_ingredients;
        if (ing?.id) ingredientMap.set(ing.id, ing);
      });

      // ===== AGGREGATION =====
      // Apply channel filter for pdv items (by source)
      const sourceAllowed = (src: string) => {
        const s = (src || "").toLowerCase();
        if (s === "salao" || s === "salon" || s === "") return channels.includes("salao");
        if (s === "balcao") return channels.includes("balcao");
        return false;
      };

      type Acc = {
        product_id: string;
        product_name: string;
        category: string;
        is_composite: boolean;
        price: number;
        quantity: number;
        revenue: number;
        orderIds: Set<string>;
        channels: Record<ChannelKey, { qty: number; revenue: number }>;
      };
      const byProduct = new Map<string, Acc>();
      const hourHeat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      const dailyMap = new Map<string, Map<string, number>>(); // date -> productId -> rev
      const modifierAgg = new Map<string, { count: number; extra_revenue: number }>();

      const ensure = (pid: string, pname: string): Acc => {
        if (!byProduct.has(pid)) {
          const p: any = productMap.get(pid);
          byProduct.set(pid, {
            product_id: pid,
            product_name: p?.name || pname,
            category: p?.category || "Sem categoria",
            is_composite: !!p?.is_composite,
            price: Number(p?.price_salon || p?.price_balcao || p?.price_delivery || 0),
            quantity: 0,
            revenue: 0,
            orderIds: new Set(),
            channels: { salao: { qty: 0, revenue: 0 }, balcao: { qty: 0, revenue: 0 }, delivery: { qty: 0, revenue: 0 } },
          });
        }
        return byProduct.get(pid)!;
      };

      (pdvItems || []).forEach((it: any) => {
        const order = it.comanda?.order;
        const src = order?.source as ChannelKey;
        if (!sourceAllowed(src)) return;
        const pid = it.product_id || it.product_name;
        if (!pid) return;
        const acc = ensure(pid, it.product_name);
        const qty = Number(it.quantity || 0);
        const rev = Number(it.subtotal || 0);
        acc.quantity += qty;
        acc.revenue += rev;
        if (order?.id) acc.orderIds.add(order.id);
        if (src === "salao" || src === "balcao") {
          acc.channels[src].qty += qty;
          acc.channels[src].revenue += rev;
        }
        // Heat — prefer item.created_at, fallback to comanda.created_at / order.closed_at
        const tstr = it.created_at || it.comanda?.created_at || order?.closed_at;
        const dt = tstr ? new Date(tstr) : null;
        if (dt) {
          hourHeat[dt.getDay()][dt.getHours()] += qty;
          const dkey = format(dt, "yyyy-MM-dd");
          if (!dailyMap.has(dkey)) dailyMap.set(dkey, new Map());
          const inner = dailyMap.get(dkey)!;
          inner.set(pid, (inner.get(pid) || 0) + rev);
        }
        // Modifiers
        const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
        mods.forEach((m: any) => {
          const name = m?.name || m?.label || (typeof m === "string" ? m : null);
          if (!name) return;
          const price = Number(m?.price_adjustment || m?.price || 0);
          const cur = modifierAgg.get(name) || { count: 0, extra_revenue: 0 };
          cur.count += qty;
          cur.extra_revenue += price * qty;
          modifierAgg.set(name, cur);
        });
      });

      (delItems || []).forEach((it: any) => {
        const pid = it.product_id || it.product_name;
        if (!pid) return;
        const acc = ensure(pid, it.product_name);
        const qty = Number(it.quantity || 0);
        const rev = Number(it.subtotal || 0);
        acc.quantity += qty;
        acc.revenue += rev;
        acc.orderIds.add(it.order?.id);
        acc.channels.delivery.qty += qty;
        acc.channels.delivery.revenue += rev;
        const dt = it.order?.delivered_at ? new Date(it.order.delivered_at) : null;
        if (dt) {
          hourHeat[dt.getDay()][dt.getHours()] += qty;
          const dkey = format(dt, "yyyy-MM-dd");
          if (!dailyMap.has(dkey)) dailyMap.set(dkey, new Map());
          const inner = dailyMap.get(dkey)!;
          inner.set(pid, (inner.get(pid) || 0) + rev);
        }
      });

      // Build rows
      const totalRevenue = Array.from(byProduct.values()).reduce((s, a) => s + a.revenue, 0);
      const rowsRaw: Omit<ProductRow, "abc">[] = Array.from(byProduct.values()).map((a) => {
        const unit_cost = unitCostOf(a.product_id, new Set());
        const cmv = unit_cost * a.quantity;
        const profit = a.revenue - cmv;
        const margin = a.revenue > 0 ? (profit / a.revenue) * 100 : 0;
        const prevRev = prevRevByProduct.get(a.product_id) ?? null;
        const delta_pct = prevRev !== null && prevRev > 0 ? ((a.revenue - prevRev) / prevRev) * 100 : (prevRev === 0 && a.revenue > 0 ? 100 : null);
        return {
          product_id: a.product_id,
          product_name: a.product_name,
          category: a.category,
          is_composite: a.is_composite,
          price: a.price,
          quantity: a.quantity,
          revenue: a.revenue,
          unit_cost,
          cmv,
          profit,
          margin,
          orders: a.orderIds.size,
          avg_ticket_item: a.quantity > 0 ? a.revenue / a.quantity : 0,
          share: totalRevenue > 0 ? a.revenue / totalRevenue : 0,
          delta_pct,
          channels: a.channels,
        };
      });
      rowsRaw.sort((x, y) => y.revenue - x.revenue);

      // ABC
      let cum = 0;
      const rows: ProductRow[] = rowsRaw.map((r) => {
        cum += r.share;
        const abc: "A" | "B" | "C" = cum <= 0.8 ? "A" : cum <= 0.95 ? "B" : "C";
        return { ...r, abc };
      });

      const abcAgg = { A: { count: 0, revenue: 0, share: 0 }, B: { count: 0, revenue: 0, share: 0 }, C: { count: 0, revenue: 0, share: 0 } };
      rows.forEach((r) => { abcAgg[r.abc].count++; abcAgg[r.abc].revenue += r.revenue; });
      (Object.keys(abcAgg) as ("A" | "B" | "C")[]).forEach((k) => { abcAgg[k].share = totalRevenue > 0 ? abcAgg[k].revenue / totalRevenue : 0; });

      // Totals
      const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
      const totalCmv = rows.reduce((s, r) => s + r.cmv, 0);
      const totalProfit = totalRevenue - totalCmv;
      const totals = {
        products: rows.length,
        qty: totalQty,
        revenue: totalRevenue,
        cmv: totalCmv,
        profit: totalProfit,
        margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        orders: new Set([
          ...(pdvItems || []).map((i: any) => i.order?.id),
          ...(delItems || []).map((i: any) => i.order?.id),
        ].filter(Boolean)).size,
        avg_ticket_item: totalQty > 0 ? totalRevenue / totalQty : 0,
      };

      // Daily series
      const dailySeries = Array.from(dailyMap.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, inner]) => {
          const perProduct: Record<string, number> = {};
          let total = 0;
          inner.forEach((v, k) => { perProduct[k] = v; total += v; });
          return { date, total, perProduct };
        });

      // Cancelled aggregation
      const cancelledByProd = new Map<string, { product_id: string; product_name: string; quantity: number; value: number; orders: Set<string> }>();
      const cancelledDetails: CancelledItemRow[] = [];
      (cancelledOrders || []).forEach((o: any) => {
        (o.pdv_order_items || []).forEach((it: any) => {
          const pid = it.product_id || it.product_name;
          if (!cancelledByProd.has(pid)) cancelledByProd.set(pid, { product_id: pid, product_name: it.product_name, quantity: 0, value: 0, orders: new Set() });
          const c = cancelledByProd.get(pid)!;
          c.quantity += Number(it.quantity || 0);
          c.value += Number(it.subtotal || 0);
          c.orders.add(o.id);
          cancelledDetails.push({
            date: o.cancelled_at,
            order_number: o.order_number,
            product_name: it.product_name,
            quantity: Number(it.quantity || 0),
            value: Number(it.subtotal || 0),
            reason: o.cancellation_reason,
          });
        });
      });
      const cancelled = Array.from(cancelledByProd.values()).map((c) => ({
        product_id: c.product_id, product_name: c.product_name, quantity: c.quantity, value: c.value, orders: c.orders.size,
      })).sort((a, b) => b.value - a.value);

      // Modifiers
      const modifiers: ModifierRow[] = Array.from(modifierAgg.entries())
        .map(([name, v]) => ({ name, count: v.count, extra_revenue: v.extra_revenue }))
        .sort((a, b) => b.count - a.count);

      // Kits
      const soldMap = new Map(rows.map((r) => [r.product_id, r]));
      const childrenNameMap = new Map(productIds.map((id) => [id, (productMap.get(id) as any)?.name || ""]));
      const kits: KitRow[] = (products || [])
        .filter((p: any) => p.is_composite)
        .map((p: any) => {
          const row = soldMap.get(p.id);
          const children = (compMap[p.id] || []).map((ch) => ({ name: childrenNameMap.get(ch.child_product_id) || "—", quantity: ch.quantity }));
          return { id: p.id, name: p.name, quantity: row?.quantity || 0, revenue: row?.revenue || 0, children };
        })
        .filter((k) => k.quantity > 0 || k.children.length > 0)
        .sort((a, b) => b.revenue - a.revenue);

      // Inactive (no sales in period)
      const soldIds = new Set(rows.map((r) => r.product_id));
      const inactiveCandidates = (products || []).filter((p: any) => !soldIds.has(p.id));
      let lastSaleByProduct = new Map<string, string>();
      if (inactiveCandidates.length) {
        const ids = inactiveCandidates.map((p: any) => p.id);
        const { data: lastSales } = await supabase
          .from("pdv_order_items")
          .select("product_id, created_at")
          .in("product_id", ids)
          .order("created_at", { ascending: false })
          .limit(2000);
        (lastSales || []).forEach((it: any) => {
          if (!lastSaleByProduct.has(it.product_id)) lastSaleByProduct.set(it.product_id, it.created_at);
        });
      }
      const today = new Date();
      const inactive: InactiveRow[] = inactiveCandidates.map((p: any) => {
        const ls = lastSaleByProduct.get(p.id);
        const days = ls ? differenceInCalendarDays(today, new Date(ls)) : null;
        return {
          id: p.id,
          name: p.name,
          category: p.category || "Sem categoria",
          price: Number(p.price_salon || p.price_balcao || 0),
          days_since_last_sale: days,
        };
      }).sort((a, b) => (a.days_since_last_sale ?? 9999) - (b.days_since_last_sale ?? 9999));

      // Coverage — for each ingredient sum daily consumption (from sold items recipes)
      const periodDays = Math.max(1, differenceInCalendarDays(params.end, params.start) + 1);
      const ingredientConsumption = new Map<string, { total: number; products: Set<string> }>(); // ingredient_id -> total qty consumed
      const recipesByProduct = new Map<string, any[]>();
      (recipes || []).forEach((r: any) => {
        if (!recipesByProduct.has(r.product_id)) recipesByProduct.set(r.product_id, []);
        recipesByProduct.get(r.product_id)!.push(r);
      });
      const accumulateConsumption = (pid: string, qty: number, visited: Set<string>) => {
        if (!pid || visited.has(pid)) return;
        visited.add(pid);
        const rec = recipesByProduct.get(pid) || [];
        rec.forEach((r: any) => {
          const ing = r.pdv_ingredients;
          if (!ing?.id) return;
          const cur = ingredientConsumption.get(ing.id) || { total: 0, products: new Set() };
          cur.total += Number(r.quantity) * qty;
          cur.products.add(productMap.get(pid)?.name || "");
          ingredientConsumption.set(ing.id, cur);
        });
        const children = compMap[pid] || [];
        children.forEach((ch) => accumulateConsumption(ch.child_product_id, qty * ch.quantity, new Set(visited)));
      };
      rows.forEach((r) => accumulateConsumption(r.product_id, r.quantity, new Set()));

      const coverage: CoverageRow[] = Array.from(ingredientConsumption.entries())
        .map(([ingId, v]) => {
          const ing = ingredientMap.get(ingId);
          if (!ing) return null;
          const perDay = v.total / periodDays;
          const stock = Number(ing.current_stock || 0);
          const daysLeft = perDay > 0 ? stock / perDay : null;
          const status: "ok" | "warn" | "danger" = daysLeft === null ? "ok" : daysLeft < 3 ? "danger" : daysLeft < 7 ? "warn" : "ok";
          const topProduct = Array.from(v.products)[0] || "";
          return {
            product_name: topProduct,
            ingredient_name: ing.name,
            current_stock: stock,
            unit: ing.unit || "",
            consumption_per_day: perDay,
            days_left: daysLeft,
            status,
          } as CoverageRow;
        })
        .filter(Boolean) as CoverageRow[];
      coverage.sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999));

      return {
        rows,
        totals,
        abc: abcAgg,
        hourHeat,
        dailySeries,
        cancelled,
        cancelledDetails,
        modifiers,
        kits,
        inactive,
        coverage,
      };
    },
  });
}
