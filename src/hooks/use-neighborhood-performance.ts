import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay } from "date-fns";

export interface NeighborhoodRow {
  neighborhood: string;
  orders: number;
  revenue: number;
  averageTicket: number;
  cancelled: number;
  cancellationRate: number;
  share: number;
}

function extractNeighborhood(text: string | null): string | null {
  if (!text) return null;
  // Expected formats like "Rua X, 100 - Bairro - Cidade/UF"
  const parts = text.split(" - ").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[1];
  if (parts.length === 2) return parts[1];
  return null;
}

export const useNeighborhoodPerformance = (userId: string, startDate: Date, endDate: Date) => {
  return useQuery({
    enabled: !!userId,
    queryKey: ["neighborhood-performance", userId, startDate, endDate],
    queryFn: async (): Promise<NeighborhoodRow[]> => {
      const { data, error } = await supabase
        .from("delivery_orders")
        .select("total,status,order_type,delivery_address_id,delivery_address_text")
        .eq("user_id", userId)
        .eq("order_type", "delivery")
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString());

      if (error) throw error;
      if (!data.length) return [];

      const addressIds = Array.from(
        new Set(data.map((o) => o.delivery_address_id).filter(Boolean) as string[])
      );

      const neighborhoodByAddress = new Map<string, string | null>();
      if (addressIds.length) {
        const { data: addrs } = await supabase
          .from("delivery_addresses")
          .select("id, neighborhood")
          .in("id", addressIds);
        addrs?.forEach((a) => neighborhoodByAddress.set(a.id, a.neighborhood ?? null));
      }

      const groups = new Map<string, { orders: number; revenue: number; cancelled: number }>();
      let totalOrders = 0;

      data.forEach((o) => {
        const fromAddr = o.delivery_address_id
          ? neighborhoodByAddress.get(o.delivery_address_id)
          : null;
        const neighborhood =
          (fromAddr && fromAddr.trim()) ||
          extractNeighborhood(o.delivery_address_text) ||
          "Sem bairro";

        const g = groups.get(neighborhood) || { orders: 0, revenue: 0, cancelled: 0 };
        g.orders += 1;
        if (o.status !== "cancelled") g.revenue += Number(o.total);
        if (o.status === "cancelled") g.cancelled += 1;
        groups.set(neighborhood, g);
        totalOrders += 1;
      });

      const rows: NeighborhoodRow[] = Array.from(groups.entries())
        .map(([neighborhood, g]) => {
          const nonCancelled = g.orders - g.cancelled;
          return {
            neighborhood,
            orders: g.orders,
            revenue: g.revenue,
            averageTicket: nonCancelled > 0 ? g.revenue / nonCancelled : 0,
            cancelled: g.cancelled,
            cancellationRate: g.orders > 0 ? (g.cancelled / g.orders) * 100 : 0,
            share: totalOrders > 0 ? (g.orders / totalOrders) * 100 : 0,
          };
        })
        .sort((a, b) => b.orders - a.orders);

      return rows;
    },
  });
};
