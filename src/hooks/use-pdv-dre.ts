import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth } from "date-fns";

const PDV_CLOSED_STATUSES = ["fechada", "fechado"];
const PDV_CANCELLED_STATUSES = ["cancelada"];

export function usePDVDre(selectedMonth?: Date) {
  const { user } = useAuth();
  const refDate = selectedMonth || new Date();

  const { data, isLoading } = useQuery({
    queryKey: ["pdv-dre", user?.id, format(refDate, "yyyy-MM")],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      const ms = format(startOfMonth(refDate), "yyyy-MM-dd");
      const me = format(endOfMonth(refDate), "yyyy-MM-dd");
      const startIso = `${ms}T00:00:00`;
      const endIso = `${me}T23:59:59`;

      // ---------- PDV ----------
      // Vendas PDV = soma dos total_sales das sessões de caixa do mês (mesma fonte do Demonstrativo)
      const { data: sessions } = await supabase
        .from("pdv_cashier_sessions")
        .select("total_sales")
        .eq("user_id", user.id)
        .gte("opened_at", startIso)
        .lte("opened_at", endIso);
      const pdvSales = (sessions || []).reduce((s: number, r: any) => s + Number(r.total_sales || 0), 0);

      // Orders do PDV no mês (para descontos, cancelamentos, taxas e CMV)
      const { data: pdvOrders } = await supabase
        .from("pdv_orders")
        .select("id, discount, status, cancelled_at")
        .eq("user_id", user.id)
        .gte("opened_at", startIso)
        .lte("opened_at", endIso);

      const closedPdvOrders = (pdvOrders || []).filter((o: any) =>
        PDV_CLOSED_STATUSES.includes(o.status)
      );
      const cancelledPdvOrders = (pdvOrders || []).filter((o: any) =>
        PDV_CANCELLED_STATUSES.includes(o.status) || !!o.cancelled_at
      );

      const pdvDiscounts = closedPdvOrders.reduce(
        (s: number, o: any) => s + Number(o.discount || 0),
        0
      );

      // Cancelamentos PDV: somar itens dos pedidos cancelados
      const cancelIds = cancelledPdvOrders.map((o: any) => o.id);
      let pdvCancellations = 0;
      if (cancelIds.length > 0) {
        const { data: cancelItems } = await supabase
          .from("pdv_order_items")
          .select("subtotal, order_id")
          .in("order_id", cancelIds);
        pdvCancellations = (cancelItems || []).reduce(
          (s: number, it: any) => s + Number(it.subtotal || 0),
          0
        );
      }

      // Taxas de meios de pagamento (PDV) — fee_amount dos pagamentos dos pedidos fechados do mês
      const closedIds = closedPdvOrders.map((o: any) => o.id);
      let paymentFees = 0;
      if (closedIds.length > 0) {
        // chunk para evitar URL muito grande
        for (let i = 0; i < closedIds.length; i += 200) {
          const slice = closedIds.slice(i, i + 200);
          const { data: pays } = await supabase
            .from("pdv_payments")
            .select("fee_amount")
            .in("order_id", slice);
          paymentFees += (pays || []).reduce((s: number, p: any) => s + Number(p.fee_amount || 0), 0);
        }
      }

      // Recebíveis pagos no período (taxas)
      const { data: receivedTx } = await supabase
        .from("pdv_financial_transactions")
        .select("fee_amount")
        .eq("user_id", user.id)
        .eq("transaction_type", "receivable")
        .eq("status", "paid")
        .gte("payment_date", ms)
        .lte("payment_date", me);
      paymentFees += (receivedTx || []).reduce(
        (s: number, t: any) => s + Number(t.fee_amount || 0),
        0
      );

      // ---------- DELIVERY ----------
      const { data: deliveryOrders } = await supabase
        .from("delivery_orders")
        .select("total, discount, status")
        .eq("user_id", user.id)
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      let deliverySales = 0;
      let deliveryDiscounts = 0;
      let deliveryCancellations = 0;
      (deliveryOrders || []).forEach((o: any) => {
        if (o.status === "completed") {
          deliverySales += Number(o.total || 0);
          deliveryDiscounts += Number(o.discount || 0);
        }
        if (o.status === "cancelled") {
          deliveryCancellations += Number(o.total || 0);
        }
      });

      // ---------- TOTAIS ----------
      const grossRevenue = pdvSales + deliverySales;
      const totalDiscounts = pdvDiscounts + deliveryDiscounts;
      const totalCancellations = pdvCancellations + deliveryCancellations;
      const deductions = totalDiscounts + totalCancellations + paymentFees;
      const netRevenue = grossRevenue - deductions;

      // ---------- CMV ----------
      let cmv = 0;
      if (closedIds.length > 0) {
        // Itens dos pedidos fechados
        const items: any[] = [];
        for (let i = 0; i < closedIds.length; i += 200) {
          const slice = closedIds.slice(i, i + 200);
          const { data: it } = await supabase
            .from("pdv_order_items")
            .select("product_id, quantity")
            .in("order_id", slice);
          if (it) items.push(...it);
        }

        const productIds = Array.from(
          new Set(items.map((i: any) => i.product_id).filter(Boolean))
        ) as string[];

        // Custo por receita
        const recipeCostMap: Record<string, number> = {};
        if (productIds.length > 0) {
          const { data: recipes } = await supabase
            .from("pdv_product_recipes")
            .select("product_id, quantity, pdv_ingredients(unit_cost)")
            .in("product_id", productIds);
          (recipes || []).forEach((r: any) => {
            const cost = Number(r.quantity || 0) * Number(r.pdv_ingredients?.unit_cost || 0);
            recipeCostMap[r.product_id] = (recipeCostMap[r.product_id] || 0) + cost;
          });
        }

        // Fallback: custo do próprio produto
        const productCostMap: Record<string, number> = {};
        if (productIds.length > 0) {
          const { data: prods } = await supabase
            .from("pdv_products")
            .select("id, cost")
            .in("id", productIds);
          (prods || []).forEach((p: any) => {
            productCostMap[p.id] = Number(p.cost || 0);
          });
        }

        items.forEach((it: any) => {
          const unitCost = recipeCostMap[it.product_id] ?? productCostMap[it.product_id] ?? 0;
          cmv += unitCost * Number(it.quantity || 0);
        });
      }

      const grossProfit = netRevenue - cmv;

      // ---------- DESPESAS OPERACIONAIS ----------
      const { data: expenses } = await supabase
        .from("pdv_financial_transactions")
        .select("amount, description, chart_account_id, pdv_chart_of_accounts(name)")
        .eq("user_id", user.id)
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
    enabled: !!user,
  });

  return { data, isLoading };
}
