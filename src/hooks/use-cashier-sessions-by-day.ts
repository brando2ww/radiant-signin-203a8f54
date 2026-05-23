import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

export interface CashierSessionSummary {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  closed_by_user_id: string | null;
  opened_by_user_id: string | null;
  operator_name: string | null;
}

/**
 * Lists cashier sessions whose [opened_at, closed_at ?? +inf] overlap the given day (YYYY-MM-DD).
 * Joins profiles to surface the operator name.
 */
export function useCashierSessionsByDay(dayISO: string) {
  const { visibleUserId, isLoading: loadingEst } = useEstablishmentId();

  return useQuery({
    queryKey: ["cashier-sessions-by-day", visibleUserId, dayISO],
    enabled: !!visibleUserId && !loadingEst && !!dayISO,
    queryFn: async (): Promise<CashierSessionSummary[]> => {
      const start = new Date(dayISO + "T00:00:00").toISOString();
      const end = new Date(new Date(dayISO + "T00:00:00").getTime() + 24 * 60 * 60 * 1000).toISOString();

      // overlap: opened_at < end AND (closed_at IS NULL OR closed_at >= start)
      const { data, error } = await supabase
        .from("pdv_cashier_sessions")
        .select("id, opened_at, closed_at, opening_balance, opened_by_user_id, closed_by_user_id")
        .eq("user_id", visibleUserId!)
        .lt("opened_at", end)
        .or(`closed_at.is.null,closed_at.gte.${start}`)
        .order("opened_at", { ascending: false });

      if (error) throw error;
      const sessions = (data || []) as any[];

      const operatorIds = Array.from(
        new Set(sessions.map((s) => s.opened_by_user_id).filter(Boolean)),
      ) as string[];

      let nameMap = new Map<string, string>();
      if (operatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", operatorIds);
        for (const p of profiles || []) {
          if (p?.id) nameMap.set(p.id as string, (p.full_name as string) || "");
        }
      }

      return sessions.map((s) => ({
        ...s,
        operator_name: s.opened_by_user_id ? nameMap.get(s.opened_by_user_id) ?? null : null,
      })) as CashierSessionSummary[];
    },
  });
}
