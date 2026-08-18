import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { startOfMonth, endOfMonth, format } from "date-fns";
import {
  brtRange,
  fetchCashierSalesByPeriod,
  summarizeCashierSales,
  fetchItemsByOrderIds,
  fetchDeliveryItemsByPeriod,
} from "@/lib/reports-data-source";

const PDV_CLOSED_STATUSES = ["fechada", "fechado"];
const PDV_CANCELLED_STATUSES = ["cancelada"];

export function usePDVDre(selectedMonth?: Date) {
  const { visibleUserId } = useEstablishmentId();
  const refDate = selectedMonth || new Date();

  const { data, isLoading } = useQuery({
    queryKey: ["pdv-dre", visibleUserId, format(refDate, "yyyy-MM")],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const owner = visibleUserId!;
      const { startISO, endISO } = brtRange(startOfMonth(refDate), endOfMonth(refDate));
      const ms = format(startOfMonth(refDate), "yyyy-MM-dd");
      const me = format(endOfMonth(refDate), "yyyy-MM-dd");

      // ---------- RECEITA (fonte única: movimentos de venda) ----------
      const movements = await fetchCashierSalesByPeriod(owner, startISO, endISO);
      const sales = summarizeCashierSales(movements);
      const pdvSales = sales.bySource.salao + sales.bySource.balcao; // salão/balcão
      const deliverySales = sales.bySource.delivery;                 // delivery (já dentro do total)
      const chargedRevenue = sales.total;                            // total efetivamente cobrado (líquido de desconto)

      // ---------- Pedidos do mês (descontos, cancelamentos informativos, taxas, CMV) ----------
      const { data: pdvOrders } = await supabase
        .from("pdv_orders")
        .select("id, discount, status, cancelled_at")
        .eq("user_id", owner)
        .gte("opened_at", startISO)
        .lte("opened_at", endISO);

      const closedPdvOrders = (pdvOrders || []).filter((o: any) => PDV_CLOSED_STATUSES.includes(o.status));
      const cancelledPdvOrders = (pdvOrders || []).filter(
        (o: any) => PDV_CANCELLED_STATUSES.includes(o.status) || !!o.cancelled_at,
      );
      const closedIds = closedPdvOrders.map((o: any) => o.id);

      const pdvDiscounts = closedPdvOrders.reduce((s: number, o: any) => s + Number(o.discount || 0), 0);

      // Cancelamentos PDV (informativo): valor dos itens dos pedidos cancelados (via comanda_items)
      const cancelIds = cancelledPdvOrders.map((o: any) => o.id);
      let pdvCancellations = 0;
      if (cancelIds.length > 0) {
        const cItems = await fetchItemsByOrderIds(cancelIds);
        pdvCancellations = cItems.reduce((s, it) => s + Number(it.subtotal || 0), 0);
      }

      // Taxas de meios de pagamento (fee_amount dos pagamentos dos pedidos fechados)
      let paymentFees = 0;
      for (let i = 0; i < closedIds.length; i += 200) {
        const slice = closedIds.slice(i, i + 200);
        const { data: pays } = await supabase.from("pdv_payments").select("fee_amount").in("order_id", slice);
        paymentFees += (pays || []).reduce((s: number, p: any) => s + Number(p.fee_amount || 0), 0);
      }
      const { data: receivedTx } = await supabase
        .from("pdv_financial_transactions")
        .select("fee_amount")
        .eq("user_id", owner)
        .eq("transaction_type", "receivable")
        .eq("status", "paid")
        .gte("payment_date", ms)
        .lte("payment_date", me);
      paymentFees += (receivedTx || []).reduce((s: number, t: any) => s + Number(t.fee_amount || 0), 0);

      // ---------- DELIVERY (descontos/cancelamentos informativos) ----------
      const { data: deliveryOrders } = await supabase
        .from("delivery_orders")
        .select("total, discount, status, discount_source")
        .eq("user_id", owner)
        .gte("created_at", startISO)
        .lte("created_at", endISO);
      let deliveryDiscounts = 0;
      let deliveryCancellations = 0;
      // Resgate de fidelidade é desconto como qualquer outro no resultado, mas
      // o gestor precisa ver o quanto o programa custou — separado do cupom.
      let loyaltyDiscounts = 0;
      (deliveryOrders || []).forEach((o: any) => {
        if (["entregue", "delivered", "completed"].includes(o.status)) {
          const d = Number(o.discount || 0);
          deliveryDiscounts += d;
          if (o.discount_source === "loyalty_prize") loyaltyDiscounts += d;
        }
        if (o.status === "cancelled" || o.status === "cancelada") deliveryCancellations += Number(o.total || 0);
      });

      // ---------- TOTAIS ----------
      const totalDiscounts = pdvDiscounts + deliveryDiscounts;
      const otherDiscounts = totalDiscounts - loyaltyDiscounts;
      const totalCancellations = pdvCancellations + deliveryCancellations; // informativo
      // Bruto (antes de desconto) reconstruído; cobrado já é líquido de desconto.
      const grossRevenue = chargedRevenue + totalDiscounts;
      const deductions = totalDiscounts + paymentFees; // desconto contado 1x; cancelamento NÃO entra (nunca foi cobrado)
      const netRevenue = grossRevenue - deductions; // = chargedRevenue - paymentFees

      // ---------- CMV (itens de salão via comanda_items + itens de delivery) ----------
      const salaoItems = closedIds.length > 0 ? await fetchItemsByOrderIds(closedIds) : [];
      const deliveryItems = await fetchDeliveryItemsByPeriod(owner, startISO, endISO);
      const allItems = [...salaoItems, ...deliveryItems];
      const productIds = Array.from(new Set(allItems.map((i) => i.product_id).filter(Boolean))) as string[];

      const recipeCostMap: Record<string, number> = {};
      const productCostMap: Record<string, number> = {};
      if (productIds.length > 0) {
        for (let i = 0; i < productIds.length; i += 200) {
          const slice = productIds.slice(i, i + 200);
          const { data: recipes } = await supabase
            .from("pdv_product_recipes")
            .select("product_id, quantity, pdv_ingredients(unit_cost)")
            .in("product_id", slice);
          (recipes || []).forEach((r: any) => {
            const cost = Number(r.quantity || 0) * Number(r.pdv_ingredients?.unit_cost || 0);
            recipeCostMap[r.product_id] = (recipeCostMap[r.product_id] || 0) + cost;
          });
          const { data: prods } = await supabase.from("pdv_products").select("id, cost").in("id", slice);
          (prods || []).forEach((p: any) => { productCostMap[p.id] = Number(p.cost || 0); });
        }
      }
      let cmv = 0;
      allItems.forEach((it) => {
        if (!it.product_id) return;
        const unitCost = recipeCostMap[it.product_id] ?? productCostMap[it.product_id] ?? 0;
        cmv += unitCost * Number(it.quantity || 0);
      });

      const grossProfit = netRevenue - cmv;

      // ---------- DESPESAS OPERACIONAIS ----------
      const { data: expenses } = await supabase
        .from("pdv_financial_transactions")
        .select("amount, description, chart_account_id, pdv_chart_of_accounts(name)")
        .eq("user_id", owner)
        .eq("transaction_type", "payable")
        .neq("status", "cancelled")
        .gte("competence_date", ms)
        .lte("competence_date", me);

      const expensesByCategory: Record<string, number> = {};
      let totalExpenses = 0;
      (expenses || []).forEach((e: any) => {
        const cat = e.pdv_chart_of_accounts?.name || "Outras despesas";
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(e.amount || 0);
        totalExpenses += Number(e.amount || 0);
      });

      const operatingProfit = grossProfit - totalExpenses;
      const netProfit = operatingProfit;
      const pct = (v: number) => (grossRevenue > 0 ? (v / grossRevenue) * 100 : 0);

      return {
        pdvSales,
        deliverySales,
        grossRevenue,
        totalDiscounts,
        loyaltyDiscounts,
        otherDiscounts,
        totalCancellations,
        paymentFees,
        deductions,
        netRevenue,
        cmv,
        grossProfit,
        expensesByCategory,
        totalExpenses,
        operatingProfit,
        netProfit,
        marginGross: pct(grossProfit),
        marginOperating: pct(operatingProfit),
        marginNet: pct(netProfit),
      };
    },
  });

  return { data, isLoading };
}
