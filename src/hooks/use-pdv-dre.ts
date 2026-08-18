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
      const salaoSales = sales.bySource.salao;
      const balcaoSales = sales.bySource.balcao;
      const pdvSales = salaoSales + balcaoSales;
      const deliverySales = sales.bySource.delivery;
      // Quitação de fiado entra no caixa mas não é venda nova — a venda foi
      // contada quando saiu a prazo. Fica de fora do faturamento e aparece à
      // parte, para o gestor saber que o dinheiro entrou.
      const quitacoesRecebidas = sales.bySource.quitacao;
      const chargedRevenue = sales.revenue; // cobrado, já líquido de desconto

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
      // O erro nunca era descartado aqui: quando a consulta falhava (foi o que
      // aconteceu por meses, com a coluna de competência inexistente), a lista
      // vinha nula e a linha aparecia zerada como se não houvesse despesa.
      const { data: expenses, error: expensesError } = await supabase
        .from("pdv_financial_transactions")
        .select("amount, description, chart_account_id, pdv_chart_of_accounts(id, code, name, parent_id)")
        .eq("user_id", owner)
        .eq("transaction_type", "payable")
        .neq("status", "cancelled")
        .gte("competence_date", ms)
        .lte("competence_date", me);
      if (expensesError) throw expensesError;

      // O plano de contas é hierárquico e a DRE precisa respeitar isso: o
      // gestor lê por grupo (MÃO-DE-OBRA, TERCEIROS), não por conta-folha
      // solta. Buscamos o plano inteiro para resolver o pai de cada conta.
      const { data: planoContas } = await supabase
        .from("pdv_chart_of_accounts")
        .select("id, code, name, parent_id, account_type")
        .eq("user_id", owner);

      const contaPorId = new Map((planoContas || []).map((c: any) => [c.id, c]));

      interface GrupoDespesa {
        code: string;
        name: string;
        total: number;
        items: Array<{ code: string; name: string; total: number }>;
      }
      const grupos = new Map<string, GrupoDespesa>();
      let totalExpenses = 0;

      (expenses || []).forEach((e: any) => {
        const valor = Number(e.amount || 0);
        totalExpenses += valor;

        const conta = e.pdv_chart_of_accounts;
        const pai = conta?.parent_id ? contaPorId.get(conta.parent_id) : null;
        // Conta sem pai é grupo de si mesma; lançamento sem conta fica visível
        // como "Sem classificação" em vez de sumir no meio das outras.
        const chaveGrupo = pai?.id ?? conta?.id ?? "__sem__";
        const nomeGrupo = pai?.name ?? conta?.name ?? "Sem classificação";
        const codGrupo = (pai?.code ?? conta?.code ?? "zz") as string;

        if (!grupos.has(chaveGrupo)) {
          grupos.set(chaveGrupo, { code: codGrupo, name: nomeGrupo, total: 0, items: [] });
        }
        const g = grupos.get(chaveGrupo)!;
        g.total += valor;

        const nomeItem = conta?.name ?? e.description ?? "Sem classificação";
        const codItem = (conta?.code ?? "") as string;
        const existente = g.items.find((i) => i.name === nomeItem);
        if (existente) existente.total += valor;
        else g.items.push({ code: codItem, name: nomeItem, total: valor });
      });

      // Ordem do plano de contas: 1.000 antes de 10.000, e não alfabética.
      const numeroDoCodigo = (c: string) => {
        const n = parseFloat(String(c).replace(/[^\d.]/g, "").split(".")[0]);
        return Number.isFinite(n) ? n : 9999;
      };
      const expenseGroups = Array.from(grupos.values())
        .map((g) => ({ ...g, items: g.items.sort((a, b) => b.total - a.total) }))
        .sort((a, b) => numeroDoCodigo(a.code) - numeroDoCodigo(b.code));

      // Mantido para quem já consumia o formato antigo (exportação em CSV).
      const expensesByCategory: Record<string, number> = {};
      expenseGroups.forEach((g) => { expensesByCategory[g.name] = g.total; });

      const operatingProfit = grossProfit - totalExpenses;
      const netProfit = operatingProfit;
      const pct = (v: number) => (grossRevenue > 0 ? (v / grossRevenue) * 100 : 0);

      return {
        pdvSales,
        salaoSales,
        balcaoSales,
        deliverySales,
        quitacoesRecebidas,
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
        expenseGroups,
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
