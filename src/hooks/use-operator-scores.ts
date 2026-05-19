import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";
import { toLocalDateStr } from "@/lib/date";

export type ScorePeriodType = "week" | "last_week" | "month" | "last_month" | "custom";

export interface OperatorRank {
  operatorId: string;
  operatorName: string;
  score: number;
  onTimeCount: number;
  totalExecutions: number;
  badges: string[];
  sector: string;
  role: string;
  avatarColor: string | null;
  completionRate: number;
  completedCount: number;
}

export interface RankingWithComparison extends OperatorRank {
  previousScore: number | null;
  scoreChange: number | null;
}

function computePeriodDates(periodType: ScorePeriodType, customStart?: string, customEnd?: string) {
  const now = new Date();
  if (periodType === "custom" && customStart && customEnd) {
    return { periodStart: customStart, periodEnd: customEnd };
  }
  if (periodType === "week") {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { periodStart: toLocalDateStr(start), periodEnd: toLocalDateStr(end) };
  }
  if (periodType === "last_week") {
    const day = now.getDay();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - day);
    const start = new Date(thisWeekStart);
    start.setDate(thisWeekStart.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { periodStart: toLocalDateStr(start), periodEnd: toLocalDateStr(end) };
  }
  if (periodType === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { periodStart: toLocalDateStr(start), periodEnd: toLocalDateStr(end) };
  }
  // month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { periodStart: toLocalDateStr(start), periodEnd: toLocalDateStr(end) };
}

function getPreviousPeriodDates(periodType: ScorePeriodType, customStart?: string, customEnd?: string) {
  if (periodType === "week") return computePeriodDates("last_week");
  if (periodType === "last_week") {
    const now = new Date();
    const day = now.getDay();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - day);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 14);
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
    return { periodStart: toLocalDateStr(lastWeekStart), periodEnd: toLocalDateStr(lastWeekEnd) };
  }
  if (periodType === "month") return computePeriodDates("last_month");
  if (periodType === "last_month") {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - 1, 0);
    return { periodStart: toLocalDateStr(start), periodEnd: toLocalDateStr(end) };
  }
  if (periodType === "custom" && customStart && customEnd) {
    const s = new Date(customStart);
    const e = new Date(customEnd);
    const diff = e.getTime() - s.getTime();
    const prevEnd = new Date(s.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - diff);
    return { periodStart: toLocalDateStr(prevStart), periodEnd: toLocalDateStr(prevEnd) };
  }
  return computePeriodDates("last_week");
}

async function fetchRankingForPeriod(userId: string, periodStart: string, periodEnd: string, periodType: ScorePeriodType): Promise<OperatorRank[]> {
  const { data: operators } = await supabase
    .from("checklist_operators")
    .select("id, name, role, sector, avatar_color, is_active")
    .eq("user_id", userId);

  if (!operators?.length) return [];

  const { data: executions } = await supabase
    .from("checklist_executions")
    .select("id, operator_id, status, started_at, completed_at, score, schedule_id, checklist_schedules(max_duration_minutes)")
    .eq("user_id", userId)
    .gte("execution_date", periodStart)
    .lte("execution_date", periodEnd);

  const execIds = (executions || []).map((e) => e.id);
  let starData: Record<string, number[]> = {};
  if (execIds.length > 0) {
    const { data: items } = await supabase
      .from("checklist_execution_items")
      .select("execution_id, value, checklist_items(item_type)")
      .in("execution_id", execIds);

    (items || []).forEach((item: any) => {
      if (item.checklist_items?.item_type === "stars" && item.value != null) {
        const execId = item.execution_id;
        if (!starData[execId]) starData[execId] = [];
        starData[execId].push(Number(item.value));
      }
    });
  }

  const ranking: OperatorRank[] = operators.map((op) => {
    const opExecs = (executions || []).filter((e) => e.operator_id === op.id);
    const total = opExecs.length;
    if (total === 0) return {
      operatorId: op.id, operatorName: op.name, score: 0, onTimeCount: 0,
      totalExecutions: 0, badges: [], sector: op.sector || "geral",
      role: op.role || "Operador", avatarColor: op.avatar_color,
      completionRate: 0, completedCount: 0,
    };

    const completed = opExecs.filter((e) => e.status === "concluido");
    const onTime = completed.filter((e) => {
      if (!e.started_at || !e.completed_at) return false;
      const maxMin = (e as any).checklist_schedules?.max_duration_minutes || 60;
      const elapsed = (new Date(e.completed_at).getTime() - new Date(e.started_at).getTime()) / 60000;
      return elapsed <= maxMin;
    });

    const prazoScore = total > 0 ? (onTime.length / total) * 40 : 0;
    const completudeScore = total > 0 ? (completed.length / total) * 30 : 0;

    const allStars = opExecs.flatMap((e) => starData[e.id] || []);
    const avgStars = allStars.length > 0 ? allStars.reduce((a, b) => a + b, 0) / allStars.length : 5;
    const qualidadeScore = (avgStars / 5) * 30;

    const score = Math.round(prazoScore + completudeScore + qualidadeScore);
    const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

    const badges: string[] = [];
    if (completed.length === total && total > 0) badges.push("Semana Perfeita");
    if (onTime.length === total && total > 0) badges.push("Zero Atrasos");

    return {
      operatorId: op.id, operatorName: op.name, score, onTimeCount: onTime.length,
      totalExecutions: total, badges, sector: op.sector || "geral",
      role: op.role || "Operador", avatarColor: op.avatar_color,
      completionRate, completedCount: completed.length,
    };
  });

  ranking.sort((a, b) => b.score - a.score);

  if ((periodType === "month" || periodType === "last_month") && ranking.length > 0 && ranking[0].score > 0) {
    ranking[0].badges.push("Destaque do Mês");
  }

  return ranking;
}

export function useOperatorRanking(periodType: ScorePeriodType = "week", customStart?: string, customEnd?: string) {
  const { user } = useAuth();
  const { periodStart, periodEnd } = useMemo(() => computePeriodDates(periodType, customStart, customEnd), [periodType, customStart, customEnd]);

  return useQuery({
    queryKey: ["operator-ranking", user?.id, periodType, periodStart, periodEnd],
    queryFn: async () => {
      if (!user?.id) return [];
      return fetchRankingForPeriod(user.id, periodStart, periodEnd, periodType);
    },
    enabled: !!user?.id,
  });
}

export function useOperatorRankingComparison(periodType: ScorePeriodType = "week", customStart?: string, customEnd?: string) {
  const { user } = useAuth();
  const current = useMemo(() => computePeriodDates(periodType, customStart, customEnd), [periodType, customStart, customEnd]);
  const previous = useMemo(() => getPreviousPeriodDates(periodType, customStart, customEnd), [periodType, customStart, customEnd]);

  return useQuery({
    queryKey: ["operator-ranking-comparison", user?.id, periodType, current.periodStart, current.periodEnd],
    queryFn: async (): Promise<RankingWithComparison[]> => {
      if (!user?.id) return [];
      const [currentRanking, previousRanking] = await Promise.all([
        fetchRankingForPeriod(user.id, current.periodStart, current.periodEnd, periodType),
        fetchRankingForPeriod(user.id, previous.periodStart, previous.periodEnd, periodType),
      ]);

      const prevMap = new Map(previousRanking.map(r => [r.operatorId, r.score]));

      return currentRanking.map(r => {
        const prevScore = prevMap.get(r.operatorId) ?? null;
        return {
          ...r,
          previousScore: prevScore,
          scoreChange: prevScore !== null ? r.score - prevScore : null,
        };
      });
    },
    enabled: !!user?.id,
  });
}

export function useScoreHistory(operatorIds: string[] | string | null) {
  const { user } = useAuth();
  const ids = Array.isArray(operatorIds) ? operatorIds : operatorIds ? [operatorIds] : [];

  return useQuery({
    queryKey: ["score-history", ...ids],
    queryFn: async () => {
      if (!user?.id || ids.length === 0) return [];
      const { data } = await supabase
        .from("operator_scores")
        .select("*")
        .in("operator_id", ids)
        .eq("user_id", user.id)
        .order("period_start", { ascending: true })
        .limit(100);
      return data || [];
    },
    enabled: !!user?.id && ids.length > 0,
  });
}

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedBy: string[];
  earnedCount: number;
}

export function useBadgesSummary(ranking: RankingWithComparison[]) {
  return useMemo(() => {
    const badges: BadgeDefinition[] = [
      { id: "semana_perfeita", name: "Semana Perfeita", description: "100% dos checklists concluídos no prazo em 7 dias", icon: "🏆", earnedBy: [], earnedCount: 0 },
      { id: "destaque_mes", name: "Destaque do Mês", description: "Maior score do mês", icon: "⭐", earnedBy: [], earnedCount: 0 },
      { id: "zero_atrasos", name: "Zero Atrasos", description: "Nenhum atraso na semana", icon: "⚡", earnedBy: [], earnedCount: 0 },
      { id: "sequencia_7", name: "Sequência de 7 dias", description: "Conclusão perfeita por 7 dias seguidos", icon: "🔥", earnedBy: [], earnedCount: 0 },
      { id: "veterano", name: "Veterano", description: "Mais de 30 dias com score acima de 70", icon: "🛡️", earnedBy: [], earnedCount: 0 },
      { id: "consistente", name: "Consistente", description: "Score acima da média por 4 semanas seguidas", icon: "📈", earnedBy: [], earnedCount: 0 },
    ];

    ranking.forEach(r => {
      if (r.badges.includes("Semana Perfeita")) {
        badges[0].earnedBy.push(r.operatorName);
        badges[0].earnedCount++;
      }
      if (r.badges.includes("Destaque do Mês")) {
        badges[1].earnedBy.push(r.operatorName);
        badges[1].earnedCount++;
      }
      if (r.badges.includes("Zero Atrasos")) {
        badges[2].earnedBy.push(r.operatorName);
        badges[2].earnedCount++;
      }
    });

    return badges;
  }, [ranking]);
}

export function usePersistScore() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (rank: OperatorRank & { periodStart: string; periodEnd: string }) => {
      if (!user?.id) throw new Error("No user");
      await supabase.from("operator_scores").upsert({
        operator_id: rank.operatorId,
        user_id: user.id,
        score: rank.score,
        on_time_count: rank.onTimeCount,
        total_executions: rank.totalExecutions,
        badges: rank.badges as any,
        period_start: rank.periodStart,
        period_end: rank.periodEnd,
      }, { onConflict: "operator_id,period_start,period_end" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-ranking"] }),
  });
}
