import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, format, differenceInMinutes } from "date-fns";

export interface DeliveryMetrics {
  totalOrders: number;
  totalRevenue: number;
  averageTicket: number;
  completedOrders: number;
  cancelledOrders: number;
  deliveryOrders: number;
  pickupOrders: number;
  cancellationRate: number;
  avgDeliveryTimeMin: number;
}

export interface DailySales {
  date: string;
  orders: number;
  revenue: number;
  averageTicket: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  category: string | null;
  quantity: number;
  revenue: number;
  revenueShare: number;
}

export const useDeliveryMetrics = (userId: string, startDate: Date, endDate: Date) => {
  return useQuery({
    queryKey: ["delivery-metrics", userId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_orders")
        .select("total,status,order_type,created_at,delivered_at")
        .eq("user_id", userId)
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString());

      if (error) throw error;

      const totalOrders = data.length;
      const totalRevenue = data.reduce((s, o) => s + Number(o.total), 0);
      const cancelled = data.filter((o) => o.status === "cancelled").length;
      const delivered = data.filter((o) => o.status === "delivered" && o.delivered_at);
      const avgDeliveryTimeMin =
        delivered.length > 0
          ? delivered.reduce(
              (s, o) =>
                s + Math.max(0, differenceInMinutes(new Date(o.delivered_at!), new Date(o.created_at))),
              0
            ) / delivered.length
          : 0;

      const metrics: DeliveryMetrics = {
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

      return metrics;
    },
  });
};

export const useDailySales = (userId: string, startDate: Date, endDate: Date) => {
  return useQuery({
    queryKey: ["daily-sales", userId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_orders")
        .select("created_at, total")
        .eq("user_id", userId)
        .neq("status", "cancelled")
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString())
        .order("created_at");

      if (error) throw error;

      const salesByDate = new Map<string, { orders: number; revenue: number }>();

      data.forEach((order) => {
        const date = format(new Date(order.created_at), "yyyy-MM-dd");
        const current = salesByDate.get(date) || { orders: 0, revenue: 0 };
        salesByDate.set(date, {
          orders: current.orders + 1,
          revenue: current.revenue + Number(order.total),
        });
      });

      const dailySales: DailySales[] = [];
      let currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dateStr = format(currentDate, "yyyy-MM-dd");
        const d = salesByDate.get(dateStr) || { orders: 0, revenue: 0 };
        dailySales.push({
          date: dateStr,
          orders: d.orders,
          revenue: d.revenue,
          averageTicket: d.orders > 0 ? d.revenue / d.orders : 0,
        });
        currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
      }

      return dailySales;
    },
  });
};

export const useTopProducts = (userId: string, startDate: Date, endDate: Date) => {
  return useQuery({
    queryKey: ["top-products", userId, startDate, endDate],
    queryFn: async () => {
      const { data: orders, error: ordersError } = await supabase
        .from("delivery_orders")
        .select("id")
        .eq("user_id", userId)
        .neq("status", "cancelled")
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString());

      if (ordersError) throw ordersError;
      if (!orders.length) return [];

      const orderIds = orders.map((o) => o.id);

      const { data: items, error: itemsError } = await supabase
        .from("delivery_order_items")
        .select("product_id, product_name, quantity, subtotal")
        .in("order_id", orderIds);

      if (itemsError) throw itemsError;

      const productIds = Array.from(new Set(items.map((i) => i.product_id).filter(Boolean)));

      // Fetch product categories
      const categoryById = new Map<string, string | null>();
      if (productIds.length) {
        const { data: prods } = await supabase
          .from("delivery_products")
          .select("id, category_id, delivery_categories:category_id(name)")
          .in("id", productIds);
        prods?.forEach((p: any) => {
          categoryById.set(p.id, p.delivery_categories?.name ?? null);
        });
      }

      const productStats = new Map<
        string,
        { name: string; quantity: number; revenue: number; category: string | null }
      >();

      items.forEach((item) => {
        const current = productStats.get(item.product_id) || {
          name: item.product_name,
          quantity: 0,
          revenue: 0,
          category: categoryById.get(item.product_id) ?? null,
        };
        productStats.set(item.product_id, {
          name: item.product_name,
          quantity: current.quantity + item.quantity,
          revenue: current.revenue + Number(item.subtotal),
          category: categoryById.get(item.product_id) ?? null,
        });
      });

      const totalRevenue = Array.from(productStats.values()).reduce((s, p) => s + p.revenue, 0);

      const topProducts: TopProduct[] = Array.from(productStats.entries())
        .map(([productId, stats]) => ({
          productId,
          productName: stats.name,
          category: stats.category,
          quantity: stats.quantity,
          revenue: stats.revenue,
          revenueShare: totalRevenue > 0 ? (stats.revenue / totalRevenue) * 100 : 0,
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 20);

      return topProducts;
    },
  });
};
