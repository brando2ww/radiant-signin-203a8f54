import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { brtRange, fetchCashierSalesByPeriod, summarizeCashierSales } from "@/lib/reports-data-source";

export function usePDVCashFlow(selectedMonth?: Date) {
  const { visibleUserId } = useEstablishmentId();
  const refDate = selectedMonth || new Date();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pdv-cash-flow", visibleUserId, format(refDate, "yyyy-MM")],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const owner = visibleUserId!;
      const monthStart = format(startOfMonth(refDate), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(refDate), "yyyy-MM-dd");

      // Entradas/saídas manuais (contas pagas)
      const { data: transactions, error } = await supabase
        .from("pdv_financial_transactions")
        .select("transaction_type, amount")
        .eq("user_id", owner)
        .eq("status", "paid")
        .gte("payment_date", monthStart)
        .lte("payment_date", monthEnd);
      if (error) throw error;

      let totalIn = 0;
      let totalOut = 0;
      (transactions || []).forEach((t) => {
        if (t.transaction_type === "receivable") totalIn += Number(t.amount);
        else totalOut += Number(t.amount);
      });

      // Receita de vendas = movimentos de venda do caixa (fonte correta)
      const { startISO, endISO } = brtRange(startOfMonth(refDate), endOfMonth(refDate));
      const pdvRevenue = summarizeCashierSales(await fetchCashierSalesByPeriod(owner, startISO, endISO)).total;
      totalIn += pdvRevenue;

      // Últimos 6 meses
      const months: { month: string; entradas: number; saidas: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(refDate, i);
        const ms = format(startOfMonth(m), "yyyy-MM-dd");
        const me = format(endOfMonth(m), "yyyy-MM-dd");
        const { startISO: mStartISO, endISO: mEndISO } = brtRange(startOfMonth(m), endOfMonth(m));

        const { data: mTx } = await supabase
          .from("pdv_financial_transactions")
          .select("transaction_type, amount")
          .eq("user_id", owner)
          .eq("status", "paid")
          .gte("payment_date", ms)
          .lte("payment_date", me);

        const mSales = summarizeCashierSales(await fetchCashierSalesByPeriod(owner, mStartISO, mEndISO)).total;
        let mIn = mSales;
        let mOut = 0;
        (mTx || []).forEach((t) => {
          if (t.transaction_type === "receivable") mIn += Number(t.amount);
          else mOut += Number(t.amount);
        });
        months.push({ month: format(m, "MMM/yy"), entradas: mIn, saidas: mOut });
      }

      // Projeção: pendentes
      const { data: pending } = await supabase
        .from("pdv_financial_transactions")
        .select("transaction_type, amount")
        .eq("user_id", owner)
        .eq("status", "pending");

      let pendingReceivable = 0;
      let pendingPayable = 0;
      (pending || []).forEach((t) => {
        if (t.transaction_type === "receivable") pendingReceivable += Number(t.amount);
        else pendingPayable += Number(t.amount);
      });

      return {
        totalIn,
        totalOut,
        balance: totalIn - totalOut,
        monthlyChart: months,
        pendingReceivable,
        pendingPayable,
        projectedBalance: (totalIn - totalOut) + pendingReceivable - pendingPayable,
      };
    },
  });

  return { data, isLoading, isError, refetch };
}
