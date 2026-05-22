import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfDay, endOfDay } from "date-fns";
import {
  fetchPaymentsByOrderIds,
  fetchItemsByOrderIds,
} from "@/lib/reports-data-source";

interface SalesReport {
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
  cancelledOrders: number;
  cancelledValue: number;
}

interface PaymentMethodReport {
  method: string;
  total: number;
  count: number;
  percentage: number;
}

interface ProductReport {
  product_name: string;
  quantity: number;
  revenue: number;
  orders: number;
}

interface SourceReport {
  source: string;
  total: number;
  count: number;
  percentage: number;
}

interface HourlyReport {
  hour: number;
  sales: number;
  orders: number;
  averageTicket: number;
}

export function usePDVReports(startDate: Date, endDate: Date) {
  const { user } = useAuth();

  const start = startOfDay(startDate).toISOString();
  const end = endOfDay(endDate).toISOString();

  // Receita real vem de pdv_payments. Quantidade de pedidos = pedidos distintos
  // com pelo menos um pagamento no período.
  const { data: salesReport, isLoading: isLoadingSales } = useQuery({
    queryKey: ["pdv-sales-report-v2", user?.id, start, end],
    queryFn: async (): Promise<SalesReport> => {
      if (!user?.id) throw new Error("User not authenticated");

      // 1) Pagamentos no período (somente pedidos do usuário)
      const { data: orderIdsData } = await supabase
        .from("pdv_orders")
        .select("id, status")
        .eq("user_id", user.id)
        .gte("opened_at", start)
        .lte("opened_at", end);

      const allOrders = orderIdsData || [];
      const closedIds = allOrders.filter((o: any) => o.status === "fechada").map((o: any) => o.id);
      const cancelledIds = allOrders.filter((o: any) => o.status === "cancelada").map((o: any) => o.id);

      const [payClosed, payCancelled] = await Promise.all([
        fetchPaymentsByOrderIds(closedIds),
        fetchPaymentsByOrderIds(cancelledIds),
      ]);

      let totalSales = 0;
      let ordersWithRevenue = 0;
      payClosed.forEach((r) => {
        totalSales += r.total;
        if (r.total > 0) ordersWithRevenue += 1;
      });

      // Pedidos sem pagamento ainda contam? Não — só "vendas efetivamente recebidas"
      const totalOrders = ordersWithRevenue;
      let cancelledValue = 0;
      payCancelled.forEach((r) => (cancelledValue += r.total));

      return {
        totalSales,
        totalOrders,
        averageTicket: totalOrders > 0 ? totalSales / totalOrders : 0,
        cancelledOrders: cancelledIds.length,
        cancelledValue,
      };
    },
    enabled: !!user?.id,
  });

  // Relatório por forma de pagamento — usa pdv_cashier_movements (já correto)
  const { data: paymentReport = [], isLoading: isLoadingPayments } = useQuery({
    queryKey: ["pdv-payment-report", user?.id, start, end],
    queryFn: async (): Promise<PaymentMethodReport[]> => {
      if (!user?.id) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("pdv_cashier_movements")
        .select("payment_method, amount, cashier_session_id")
        .eq("type", "venda")
        .not("payment_method", "is", null);

      if (error) throw error;

      const { data: sessions } = await supabase
        .from("pdv_cashier_sessions")
        .select("id")
        .eq("user_id", user.id)
        .gte("opened_at", start)
        .lte("opened_at", end);

      const sessionIds = sessions?.map((s) => s.id) || [];
      const filteredData = data?.filter((m) => sessionIds.includes(m.cashier_session_id)) || [];

      const grouped: Record<string, { total: number; count: number }> = {};
      filteredData.forEach((item) => {
        const method = item.payment_method || "outros";
        if (!grouped[method]) grouped[method] = { total: 0, count: 0 };
        grouped[method].total += item.amount || 0;
        grouped[method].count += 1;
      });

      const total = Object.values(grouped).reduce((sum, g) => sum + g.total, 0);

      return Object.entries(grouped).map(([method, data]) => ({
        method,
        total: data.total,
        count: data.count,
        percentage: total > 0 ? (data.total / total) * 100 : 0,
      }));
    },
    enabled: !!user?.id,
  });

  // Relatório por produto — agora vem de pdv_comanda_items via pdv_comandas
  const { data: productReport = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ["pdv-product-report-v2", user?.id, start, end],
    queryFn: async (): Promise<ProductReport[]> => {
      if (!user?.id) throw new Error("User not authenticated");

      const { data: orders } = await supabase
        .from("pdv_orders")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "fechada")
        .gte("opened_at", start)
        .lte("opened_at", end);

      const orderIds = (orders || []).map((o: any) => o.id);
      const items = await fetchItemsByOrderIds(orderIds);

      const grouped: Record<string, ProductReport & { _orders: Set<string> }> = {};
      items.forEach((it) => {
        const name = it.product_name || "—";
        if (!grouped[name]) {
          grouped[name] = { product_name: name, quantity: 0, revenue: 0, orders: 0, _orders: new Set() };
        }
        grouped[name].quantity += it.quantity;
        grouped[name].revenue += it.subtotal;
        if (it.order_id) grouped[name]._orders.add(it.order_id);
      });

      return Object.values(grouped)
        .map((g) => ({ product_name: g.product_name, quantity: g.quantity, revenue: g.revenue, orders: g._orders.size }))
        .sort((a, b) => b.revenue - a.revenue);
    },
    enabled: !!user?.id,
  });

  // Origem (salão/balcão) — receita real via payments
  const { data: sourceReport = [], isLoading: isLoadingSources } = useQuery({
    queryKey: ["pdv-source-report-v2", user?.id, start, end],
    queryFn: async (): Promise<SourceReport[]> => {
      if (!user?.id) throw new Error("User not authenticated");

      const { data: orders, error } = await supabase
        .from("pdv_orders")
        .select("id, source")
        .eq("user_id", user.id)
        .eq("status", "fechada")
        .gte("opened_at", start)
        .lte("opened_at", end);
      if (error) throw error;

      const orderIds = (orders || []).map((o: any) => o.id);
      const payments = await fetchPaymentsByOrderIds(orderIds);

      const grouped: Record<string, { total: number; count: number }> = {};
      (orders || []).forEach((o: any) => {
        const src = o.source || "—";
        const rev = payments.get(o.id)?.total || 0;
        if (!grouped[src]) grouped[src] = { total: 0, count: 0 };
        grouped[src].total += rev;
        if (rev > 0) grouped[src].count += 1;
      });

      const total = Object.values(grouped).reduce((s, g) => s + g.total, 0);
      return Object.entries(grouped).map(([source, d]) => ({
        source,
        total: d.total,
        count: d.count,
        percentage: total > 0 ? (d.total / total) * 100 : 0,
      }));
    },
    enabled: !!user?.id,
  });

  // Vendas por hora — usa hora do primeiro pagamento (processed_at)
  const { data: hourlyReport = [], isLoading: isLoadingHourly } = useQuery({
    queryKey: ["pdv-hourly-report-v2", user?.id, start, end],
    queryFn: async (): Promise<HourlyReport[]> => {
      if (!user?.id) throw new Error("User not authenticated");

      // Buscar pagamentos cujo pedido pertence ao usuário e que foram processados no período
      const { data, error } = await supabase
        .from("pdv_payments")
        .select("amount, processed_at, order_id, order:pdv_orders!inner(user_id)")
        .eq("order.user_id", user.id)
        .gte("processed_at", start)
        .lte("processed_at", end)
        .not("processed_at", "is", null);
      if (error) throw error;

      const byHour: Record<number, { sales: number; orderSet: Set<string> }> = {};
      for (let i = 0; i < 24; i++) byHour[i] = { sales: 0, orderSet: new Set() };

      (data || []).forEach((p: any) => {
        const hour = new Date(p.processed_at).getHours();
        byHour[hour].sales += Number(p.amount || 0);
        if (p.order_id) byHour[hour].orderSet.add(p.order_id);
      });

      return Object.entries(byHour).map(([hour, d]) => ({
        hour: parseInt(hour),
        sales: d.sales,
        orders: d.orderSet.size,
        averageTicket: d.orderSet.size > 0 ? d.sales / d.orderSet.size : 0,
      }));
    },
    enabled: !!user?.id,
  });

  const isLoading =
    isLoadingSales || isLoadingPayments || isLoadingProducts || isLoadingSources || isLoadingHourly;

  return {
    salesReport,
    paymentReport,
    productReport,
    sourceReport,
    hourlyReport,
    isLoading,
  };
}
