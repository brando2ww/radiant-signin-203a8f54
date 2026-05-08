import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, eachDayOfInterval, isSameDay } from "date-fns";

export interface CashierStatementSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  closing_balance: number | null;
  total_sales: number;
  total_cash: number;
  total_card: number;
  total_credit?: number | null;
  total_debit?: number | null;
  total_pix: number;
  total_voucher?: number | null;
  total_online_delivery?: number | null;
  total_withdrawals: number;
  expected_balance: number | null;
  balance_difference: number | null;
  fraud_risk_level: string | null;
  notes: string | null;
  // Conferência ampliada
  declared_cash?: number | null;
  declared_credit?: number | null;
  declared_debit?: number | null;
  declared_pix?: number | null;
  declared_voucher?: number | null;
  declared_online_delivery?: number | null;
  declared_other?: number | null;
  credit_difference?: number | null;
  debit_difference?: number | null;
  pix_difference?: number | null;
  voucher_difference?: number | null;
  online_delivery_difference?: number | null;
  other_difference?: number | null;
  declared_total_sales?: number | null;
  total_difference?: number | null;
  closing_status?: "no_difference" | "surplus" | "shortage" | null;
  closing_justification?: string | null;
  user_id?: string;
  movements: any[];
}

export interface DailySummary {
  date: string;
  sessions: CashierStatementSession[];
  totalSales: number;
  totalCash: number;
  totalCard: number;
  totalPix: number;
  totalWithdrawals: number;
  hasDifference: boolean;
}

export function usePDVCashierStatement(mode: "daily" | "monthly", selectedDate: Date) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["pdv-cashier-statement", user?.id, mode, format(selectedDate, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      let dateFrom: string;
      let dateTo: string;

      if (mode === "daily") {
        dateFrom = startOfDay(selectedDate).toISOString();
        dateTo = endOfDay(selectedDate).toISOString();
      } else {
        dateFrom = startOfMonth(selectedDate).toISOString();
        dateTo = endOfMonth(selectedDate).toISOString();
      }

      const { data: sessions, error } = await supabase
        .from("pdv_cashier_sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("opened_at", dateFrom)
        .lte("opened_at", dateTo)
        .order("opened_at", { ascending: false });

      if (error) throw error;

      // Fetch movements for all sessions
      const sessionIds = (sessions || []).map((s) => s.id);
      let allMovements: any[] = [];
      if (sessionIds.length > 0) {
        const { data: movements } = await supabase
          .from("pdv_cashier_movements")
          .select("*")
          .in("cashier_session_id", sessionIds)
          .order("created_at", { ascending: true });
        allMovements = movements || [];
      }

      const enrichedSessions: CashierStatementSession[] = (sessions || []).map((s: any) => ({
        ...s,
        opening_balance: Number(s.opening_balance),
        closing_balance: s.closing_balance != null ? Number(s.closing_balance) : null,
        total_sales: Number(s.total_sales),
        total_cash: Number(s.total_cash),
        total_card: Number(s.total_card),
        total_pix: Number(s.total_pix),
        total_withdrawals: Number(s.total_withdrawals),
        expected_balance: s.expected_balance != null ? Number(s.expected_balance) : null,
        balance_difference: s.balance_difference != null ? Number(s.balance_difference) : null,
        movements: allMovements.filter((m) => m.cashier_session_id === s.id),
      }));

      // KPIs
      const totalSales = enrichedSessions.reduce((s, ss) => s + ss.total_sales, 0);
      const totalCash = enrichedSessions.reduce((s, ss) => s + ss.total_cash, 0);
      const totalCard = enrichedSessions.reduce((s, ss) => s + ss.total_card, 0);
      const totalPix = enrichedSessions.reduce((s, ss) => s + ss.total_pix, 0);
      const totalWithdrawals = enrichedSessions.reduce((s, ss) => s + ss.total_withdrawals, 0);
      const sessionsWithDifference = enrichedSessions.filter(
        (s) => s.balance_difference !== null && Math.abs(s.balance_difference) > 5
      ).length;

      // Daily summaries for monthly view
      let dailySummaries: DailySummary[] = [];
      if (mode === "monthly") {
        const days = eachDayOfInterval({
          start: startOfMonth(selectedDate),
          end: endOfMonth(selectedDate) > new Date() ? new Date() : endOfMonth(selectedDate),
        });

        dailySummaries = days
          .map((day) => {
            const daySessions = enrichedSessions.filter((s) =>
              isSameDay(new Date(s.opened_at), day)
            );
            if (daySessions.length === 0) return null;
            return {
              date: format(day, "yyyy-MM-dd"),
              sessions: daySessions,
              totalSales: daySessions.reduce((s, ss) => s + ss.total_sales, 0),
              totalCash: daySessions.reduce((s, ss) => s + ss.total_cash, 0),
              totalCard: daySessions.reduce((s, ss) => s + ss.total_card, 0),
              totalPix: daySessions.reduce((s, ss) => s + ss.total_pix, 0),
              totalWithdrawals: daySessions.reduce((s, ss) => s + ss.total_withdrawals, 0),
              hasDifference: daySessions.some(
                (s) => s.balance_difference !== null && Math.abs(s.balance_difference) > 5
              ),
            };
          })
          .filter(Boolean) as DailySummary[];
      }

      const daysWithSales = new Set(
        enrichedSessions.map((s) => format(new Date(s.opened_at), "yyyy-MM-dd"))
      ).size;
      const avgPerDay = daysWithSales > 0 ? totalSales / daysWithSales : 0;

      return {
        sessions: enrichedSessions,
        dailySummaries,
        kpis: {
          totalSales,
          totalCash,
          totalCard,
          totalPix,
          totalWithdrawals,
          sessionsCount: enrichedSessions.length,
          sessionsWithDifference,
          avgPerDay,
          daysWithSales,
        },
      };
    },
    enabled: !!user,
  });

  return { data, isLoading };
}
