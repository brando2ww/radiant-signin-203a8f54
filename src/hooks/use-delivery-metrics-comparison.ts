import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, differenceInDays, subDays, differenceInMinutes } from "date-fns";
import type { DeliveryMetrics } from "./use-delivery-reports";

export interface MetricsComparison {
  previous: DeliveryMetrics;
  deltas: {
    totalOrders: number | null;
    totalRevenue: number | null;
    averageTicket: number | null;
    cancellationRate: number | null;
    avgDeliveryTimeMin: number | null;
    deliveryOrders: number | null;
    pickupOrders: number | null;
  };
}

function pct(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

export const useDeliveryMetricsComparison = (
  userId: string,
  startDate: Date,
  endDate: Date,
  current: DeliveryMetrics | undefined,
  customCompare?: { from: Date; to: Date } | null
) => {
  return useQuery({
    enabled: !!userId && !!current && customCompare !== null,
    queryKey: [
      "delivery-metrics-comparison",
      userId,
      startDate,
      endDate,
      customCompare?.from,
      customCompare?.to,
    ],
    queryFn: async (): Promise<MetricsComparison> => {
      let prevStart: Date;
      let prevEnd: Date;
      if (customCompare) {
        prevStart = customCompare.from;
        prevEnd = customCompare.to;
      } else {
        const days = Math.max(1, differenceInDays(endDate, startDate) + 1);
        prevEnd = subDays(startDate, 1);
        prevStart = subDays(prevEnd, days - 1);
      }

      const { data, error } = await supabase
        .from("delivery_orders")
        .select("total,status,order_type,created_at,delivered_at")
        .eq("user_id", userId)
        .gte("created_at", startOfDay(prevStart).toISOString())
        .lte("created_at", endOfDay(prevEnd).toISOString());

      if (error) throw error;

      const totalOrders = data.length;
      const totalRevenue = data.reduce((s, o) => s + Number(o.total), 0);
      const cancelled = data.filter((o) => o.status === "cancelled").length;
      const delivered = data.filter((o) => o.status === "delivered" && o.delivered_at);
      const avgDeliveryTimeMin =
        delivered.length > 0
          ? delivered.reduce(
              (s, o) =>
                s +
                Math.max(
                  0,
                  differenceInMinutes(new Date(o.delivered_at!), new Date(o.created_at))
                ),
              0
            ) / delivered.length
          : 0;

      const previous: DeliveryMetrics = {
        totalOrders,
        totalRevenue,
        averageTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        completedOrders: data.filter((o) => o.status === "delivered").length,
        cancelledOrders: cancelled,
        deliveryOrders: data.filter((o) => o.order_type === "delivery").length,
        pickupOrders: data.filter((o) => o.order_type === "pickup").length,
        cancellationRate: totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0,
        avgDeliveryTimeMin,
      };

      const c = current!;
      return {
        previous,
        deltas: {
          totalOrders: pct(c.totalOrders, previous.totalOrders),
          totalRevenue: pct(c.totalRevenue, previous.totalRevenue),
          averageTicket: pct(c.averageTicket, previous.averageTicket),
          cancellationRate: pct(c.cancellationRate, previous.cancellationRate),
          avgDeliveryTimeMin: pct(c.avgDeliveryTimeMin, previous.avgDeliveryTimeMin),
          deliveryOrders: pct(c.deliveryOrders, previous.deliveryOrders),
          pickupOrders: pct(c.pickupOrders, previous.pickupOrders),
        },
      };
    },
  });
};
