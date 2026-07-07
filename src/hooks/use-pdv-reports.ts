import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import {
  brtRange,
  brtHour,
  fetchCashierSalesByPeriod,
  summarizeCashierSales,
  fetchItemsByOrderIds,
  fetchDeliveryItemsByPeriod,
  fetchPaymentsByOrderIds,
  channelOfSource,
} from "@/lib/reports-data-source";

interface SalesReport {
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
  cancelledOrders: number;
  cancelledValue: number;
}
interface PaymentMethodReport { method: string; total: number; count: number; percentage: number; }
interface ProductReport { product_name: string; quantity: number; revenue: number; orders: number; }
interface SourceReport { source: string; total: number; count: number; percentage: number; }
interface HourlyReport { hour: number; sales: number; orders: number; averageTicket: number; }

const CLOSED = ["fechada", "fechado"];
const DELIVERED = ["entregue", "delivered", "completed"];

export function usePDVReports(startDate: Date, endDate: Date) {
  const { visibleUserId } = useEstablishmentId();
  const owner = visibleUserId;
  const { startISO: start, endISO: end } = brtRange(startDate, endDate);

  // ===== Vendas (fonte única = movimentos venda) =====
  const { data: salesReport, isLoading: isLoadingSales } = useQuery({
    queryKey: ["pdv-sales-report-v4", owner, start, end],
    enabled: !!owner,
    queryFn: async (): Promise<SalesReport> => {
      const movements = await fetchCashierSalesByPeriod(owner!, start, end);
      const totalSales = movements.reduce((s, m) => s + m.amount, 0);

      // nº de vendas = comandas fechadas + pedidos de delivery entregues (denominador do ticket)
      const [{ count: closedCount }, { count: deliveredCount }] = await Promise.all([
        supabase.from("pdv_orders").select("id", { count: "exact", head: true })
          .eq("user_id", owner!).in("status", CLOSED).gte("opened_at", start).lte("opened_at", end),
        supabase.from("delivery_orders").select("id", { count: "exact", head: true })
          .eq("user_id", owner!).in("status", DELIVERED).gte("created_at", start).lte("created_at", end),
      ]);
      const totalOrders = (closedCount || 0) + (deliveredCount || 0);

      // Cancelamentos (informativo)
      const { data: cancelledOrdersData } = await supabase
        .from("pdv_orders").select("id").eq("user_id", owner!).eq("status", "cancelada")
        .gte("opened_at", start).lte("opened_at", end);
      const cancelledIds = (cancelledOrdersData || []).map((o: any) => o.id);
      const payCancelled = await fetchPaymentsByOrderIds(cancelledIds);
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
  });

  // ===== Forma de pagamento (movimentos, paginado/escopado) =====
  const { data: paymentReport = [], isLoading: isLoadingPayments } = useQuery({
    queryKey: ["pdv-payment-report-v2", owner, start, end],
    enabled: !!owner,
    queryFn: async (): Promise<PaymentMethodReport[]> => {
      const summary = summarizeCashierSales(await fetchCashierSalesByPeriod(owner!, start, end));
      const total = summary.total;
      // count por método
      const movements = await fetchCashierSalesByPeriod(owner!, start, end);
      const counts: Record<string, number> = {};
      movements.forEach((m) => { const k = m.payment_method || "outros"; counts[k] = (counts[k] || 0) + 1; });
      return Object.entries(summary.byMethod).map(([method, val]) => ({
        method,
        total: val,
        count: counts[method] || 0,
        percentage: total > 0 ? (val / total) * 100 : 0,
      }));
    },
  });

  // ===== Por produto (salão via comanda_items + delivery) =====
  const { data: productReport = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ["pdv-product-report-v3", owner, start, end],
    enabled: !!owner,
    queryFn: async (): Promise<ProductReport[]> => {
      const { data: orders } = await supabase
        .from("pdv_orders").select("id").eq("user_id", owner!).in("status", CLOSED)
        .gte("opened_at", start).lte("opened_at", end);
      const orderIds = (orders || []).map((o: any) => o.id);
      const salao = await fetchItemsByOrderIds(orderIds);
      const delivery = await fetchDeliveryItemsByPeriod(owner!, start, end);

      const grouped: Record<string, ProductReport & { _orders: Set<string> }> = {};
      const add = (name: string, qty: number, rev: number, orderId?: string) => {
        if (!grouped[name]) grouped[name] = { product_name: name, quantity: 0, revenue: 0, orders: 0, _orders: new Set() };
        grouped[name].quantity += qty;
        grouped[name].revenue += rev;
        if (orderId) grouped[name]._orders.add(orderId);
      };
      salao.forEach((it) => add(it.product_name || "—", it.quantity, it.subtotal, it.order_id));
      delivery.forEach((it) => add(it.product_name || "—", it.quantity, it.subtotal));

      return Object.values(grouped)
        .map((g) => ({ product_name: g.product_name, quantity: g.quantity, revenue: g.revenue, orders: g._orders.size }))
        .sort((a, b) => b.revenue - a.revenue);
    },
  });

  // ===== Por origem (deriva dos movimentos → reconcilia com o total) =====
  const { data: sourceReport = [], isLoading: isLoadingSources } = useQuery({
    queryKey: ["pdv-source-report-v3", owner, start, end],
    enabled: !!owner,
    queryFn: async (): Promise<SourceReport[]> => {
      const movements = await fetchCashierSalesByPeriod(owner!, start, end);
      const grouped: Record<string, { total: number; count: number }> = {};
      movements.forEach((m) => {
        const src = channelOfSource(m.source);
        if (!grouped[src]) grouped[src] = { total: 0, count: 0 };
        grouped[src].total += m.amount;
        grouped[src].count += 1;
      });
      const total = Object.values(grouped).reduce((s, g) => s + g.total, 0);
      const label: Record<string, string> = { salao: "Salão", balcao: "Balcão", delivery: "Delivery" };
      return Object.entries(grouped).map(([source, d]) => ({
        source: label[source] || source,
        total: d.total,
        count: d.count,
        percentage: total > 0 ? (d.total / total) * 100 : 0,
      }));
    },
  });

  // ===== Por hora (deriva dos movimentos, hora em BRT) =====
  const { data: hourlyReport = [], isLoading: isLoadingHourly } = useQuery({
    queryKey: ["pdv-hourly-report-v3", owner, start, end],
    enabled: !!owner,
    queryFn: async (): Promise<HourlyReport[]> => {
      const movements = await fetchCashierSalesByPeriod(owner!, start, end);
      const byHour: Record<number, { sales: number; count: number }> = {};
      for (let i = 0; i < 24; i++) byHour[i] = { sales: 0, count: 0 };
      movements.forEach((m) => {
        const h = brtHour(m.created_at);
        byHour[h].sales += m.amount;
        byHour[h].count += 1;
      });
      return Object.entries(byHour).map(([hour, d]) => ({
        hour: parseInt(hour),
        sales: d.sales,
        orders: d.count,
        averageTicket: d.count > 0 ? d.sales / d.count : 0,
      }));
    },
  });

  const isLoading =
    isLoadingSales || isLoadingPayments || isLoadingProducts || isLoadingSources || isLoadingHourly;

  return { salesReport, paymentReport, productReport, sourceReport, hourlyReport, isLoading };
}
