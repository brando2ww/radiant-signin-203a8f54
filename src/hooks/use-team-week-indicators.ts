import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface OperatorWeekStat {
  operatorId: string;
  name: string;
  avgScore: number;
  executions: number;
}

export function useTeamWeekIndicators() {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: ["team-week-indicators", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<{ best: OperatorWeekStat | null; worst: OperatorWeekStat | null }> => {
      const now = new Date();
      const from = startOfWeek(now, { locale: ptBR });
      const to = endOfWeek(now, { locale: ptBR });

      const { data, error } = await supabase
        .from("checklist_executions")
        .select("operator_id, score, status, checklist_operators(name)")
        .eq("user_id", visibleUserId!)
        .eq("status", "concluido")
        .gte("execution_date", from.toISOString().slice(0, 10))
        .lte("execution_date", to.toISOString().slice(0, 10))
        .limit(1000);
      if (error) throw error;

      const agg = new Map<string, { total: number; count: number; name: string }>();
      for (const row of (data as any[]) || []) {
        if (!row.operator_id) continue;
        const score = Number(row.score ?? 0);
        const entry = agg.get(row.operator_id) || {
          total: 0,
          count: 0,
          name: row.checklist_operators?.name || "—",
        };
        entry.total += score;
        entry.count += 1;
        agg.set(row.operator_id, entry);
      }

      const stats: OperatorWeekStat[] = Array.from(agg.entries()).map(([operatorId, v]) => ({
        operatorId,
        name: v.name,
        avgScore: v.count > 0 ? v.total / v.count : 0,
        executions: v.count,
      }));

      if (stats.length === 0) return { best: null, worst: null };

      const sorted = [...stats].sort((a, b) => b.avgScore - a.avgScore);
      return { best: sorted[0], worst: sorted[sorted.length - 1] };
    },
  });
}
