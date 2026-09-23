import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/reports/fetch-all";
import { startOfDay, endOfDay, format } from "date-fns";

export interface ProductDailyPoint {
  date: string;
  quantity: number;
  revenue: number;
}

export const useProductDailySales = (
  userId: string,
  productId: string | null,
  startDate: Date,
  endDate: Date
) => {
  return useQuery({
    enabled: !!userId && !!productId,
    queryKey: ["product-daily-sales", userId, productId, startDate, endDate],
    queryFn: async (): Promise<ProductDailyPoint[]> => {
      const orders = await fetchAll((de, ate) => supabase
        .from("delivery_orders")
        .select("id, created_at")
        .eq("user_id", userId)
        .neq("status", "cancelled")
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString())
        .order("id")
        .range(de, ate));

      if (!orders.length) return [];

      const orderDate = new Map(orders.map((o) => [o.id, o.created_at]));
      const orderIds = orders.map((o) => o.id);

      const items: any[] = [];
      for (let i = 0; i < orderIds.length; i += 200) {
        const lote = orderIds.slice(i, i + 200);
        items.push(...await fetchAll((de, ate) => supabase
          .from("delivery_order_items")
          .select("order_id, quantity, subtotal")
          .eq("product_id", productId!)
          .in("order_id", lote)
          .order("id")
          .range(de, ate)));
      }

      const byDate = new Map<string, { quantity: number; revenue: number }>();

      items.forEach((it) => {
        const created = orderDate.get(it.order_id);
        if (!created) return;
        const d = format(new Date(created), "yyyy-MM-dd");
        const cur = byDate.get(d) || { quantity: 0, revenue: 0 };
        cur.quantity += it.quantity;
        cur.revenue += Number(it.subtotal);
        byDate.set(d, cur);
      });

      const result: ProductDailyPoint[] = [];
      let cur = new Date(startDate);
      while (cur <= endDate) {
        const d = format(cur, "yyyy-MM-dd");
        const v = byDate.get(d) || { quantity: 0, revenue: 0 };
        result.push({ date: d, ...v });
        cur = new Date(cur.setDate(cur.getDate() + 1));
      }
      return result;
    },
  });
};
