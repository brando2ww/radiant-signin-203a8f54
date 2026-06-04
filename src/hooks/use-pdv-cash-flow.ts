import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

export function usePDVCashFlow(selectedMonth?: Date) {
  const { user } = useAuth();
  const refDate = selectedMonth || new Date();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pdv-cash-flow", user?.id, format(refDate, "yyyy-MM")],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      const monthStart = format(startOfMonth(refDate), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(refDate), "yyyy-MM-dd");

      // Fetch current month transactions
      const { data: transactions, error } = await supabase
        .from("pdv_financial_transactions")
        .select("*")
        .eq("user_id", user.id)
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

      // Also count closed PDV orders in the month as income
      const { data: pdvOrders } = await supabase
        .from("pdv_orders")
        .select("total")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("closed_at", monthStart)
        .lte("closed_at", monthEnd + "T23:59:59");

      const pdvRevenue = (pdvOrders || []).reduce((s, o) => s + Number(o.total), 0);
      totalIn += pdvRevenue;

      // Fetch last 6 months for chart
      const months: { month: string; entradas: number; saidas: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(refDate, i);
        const ms = format(startOfMonth(m), "yyyy-MM-dd");
        const me = format(endOfMonth(m), "yyyy-MM-dd");

        const { data: mTx } = await supabase
          .from("pdv_financial_transactions")
          .select("transaction_type, amount")
          .eq("user_id", user.id)
          .eq("status", "paid")
          .gte("payment_date", ms)
          .lte("payment_date", me);

        const { data: mOrders } = await supabase
          .from("pdv_orders")
          .select("total")
          .eq("user_id", user.id)
          .eq("status", "closed")
          .gte("closed_at", ms)
          .lte("closed_at", me + "T23:59:59");

        let mIn = (mOrders || []).reduce((s, o) => s + Number(o.total), 0);
        let mOut = 0;
        (mTx || []).forEach((t) => {
          if (t.transaction_type === "receivable") mIn += Number(t.amount);
          else mOut += Number(t.amount);
        });

        months.push({ month: format(m, "MMM/yy"), entradas: mIn, saidas: mOut });
      }

      // Projection: pending receivables & payables
      const { data: pending } = await supabase
        .from("pdv_financial_transactions")
        .select("transaction_type, amount")
        .eq("user_id", user.id)
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
    enabled: !!user,
  });

  return { data, isLoading, isError, refetch };
}
