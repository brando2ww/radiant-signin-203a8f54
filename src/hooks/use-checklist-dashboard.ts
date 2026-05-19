import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { subDays, format, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toLocalDateStr } from "@/lib/date";

interface DashboardFilters {
  date: string;
  shift?: string;
  sector?: string;
  operatorId?: string;
}

export function useChecklistDashboard(filters?: DashboardFilters) {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const date = filters?.date || toLocalDateStr();

  // Daily metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["checklist-dashboard-metrics", visibleUserId, date],
    queryFn: async () => {
      if (!visibleUserId) return null;
      const { data, error } = await supabase
        .from("checklist_executions")
        .select("id, status, score, schedule_id, started_at, completed_at, operator_id, checklist_id, checklists(name, sector), checklist_operators(name)")
        .eq("user_id", visibleUserId)
        .eq("execution_date", date);

      if (error) throw error;
      const execs = data || [];
      const total = execs.length;
      const concluido = execs.filter((e: any) => e.status === "concluido").length;
      const atrasado = execs.filter((e: any) => e.status === "atrasado").length;
      const naoIniciado = execs.filter((e: any) => e.status === "pendente" || e.status === "nao_iniciado" || e.status === "em_andamento").length;
      const emAndamento = execs.filter((e: any) => e.status === "em_andamento").length;
      const avgScore = concluido > 0
        ? Math.round(execs.filter((e: any) => e.score != null).reduce((s: number, e: any) => s + e.score, 0) / concluido)
        : 0;

      return { total, concluido, atrasado, naoIniciado, emAndamento, avgScore, executions: execs };
    },
    enabled: !!visibleUserId,
    refetchInterval: 30000,
  });

  // Completion chart (last 7 days)
  const { data: completionChart = [], isLoading: chartLoading } = useQuery({
    queryKey: ["checklist-completion-chart", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const days: { date: string; label: string; total: number; completed: number; pct: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = subDays(new Date(), i);
        const dateStr = format(d, "yyyy-MM-dd");
        const rawLabel = format(d, "EEE", { locale: ptBR }).replace(".", "");
        const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
        const { data } = await supabase
          .from("checklist_executions")
          .select("status")
          .eq("user_id", visibleUserId)
          .eq("execution_date", dateStr);

        const total = data?.length || 0;
        const completed = data?.filter((e: any) => e.status === "concluido").length || 0;
        days.push({ date: dateStr, label, total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 });
      }
      return days;
    },
    enabled: !!visibleUserId,
  });

  // Shift comparison with best operator per shift
  const { data: shiftComparison = [], isLoading: shiftLoading } = useQuery({
    queryKey: ["checklist-shift-comparison", visibleUserId, date],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const { data: execs } = await supabase
        .from("checklist_executions")
        .select("status, score, schedule_id, operator_id, checklist_schedules(shift), checklist_operators(name)")
        .eq("user_id", visibleUserId)
        .eq("execution_date", date);

      const shifts: Record<string, { total: number; completed: number; late: number; operators: Record<string, { name: string; score: number; count: number }> }> = {};
      (execs || []).forEach((e: any) => {
        const shift = e.checklist_schedules?.shift || "Sem turno";
        if (!shifts[shift]) shifts[shift] = { total: 0, completed: 0, late: 0, operators: {} };
        shifts[shift].total++;
        if (e.status === "concluido") shifts[shift].completed++;
        if (e.status === "atrasado") shifts[shift].late++;
        if (e.operator_id && e.score != null) {
          if (!shifts[shift].operators[e.operator_id]) {
            shifts[shift].operators[e.operator_id] = { name: e.checklist_operators?.name || "—", score: 0, count: 0 };
          }
          shifts[shift].operators[e.operator_id].score += e.score;
          shifts[shift].operators[e.operator_id].count++;
        }
      });

      return Object.entries(shifts).map(([name, data]) => {
        const ops = Object.values(data.operators);
        const best = ops.length > 0
          ? ops.reduce((a, b) => (a.score / a.count) > (b.score / b.count) ? a : b)
          : null;
        return {
          name,
          total: data.total,
          completed: data.completed,
          late: data.late,
          pct: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
          bestOperator: best ? best.name : null,
          bestScore: best ? Math.round(best.score / best.count) : null,
        };
      });
    },
    enabled: !!visibleUserId,
  });

  // Critical open tasks
  const { data: criticalTasks = [], isLoading: criticalLoading } = useQuery({
    queryKey: ["checklist-critical-tasks", visibleUserId, date],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const { data: execs } = await supabase
        .from("checklist_executions")
        .select("id, status, checklist_id, operator_id, schedule_id, started_at, checklists(name, sector), checklist_operators(name), checklist_schedules(start_time, shift)")
        .eq("user_id", visibleUserId)
        .eq("execution_date", date)
        .in("status", ["atrasado", "pendente", "nao_iniciado", "em_andamento"]);

      if (!execs || execs.length === 0) return [];

      const checklistIds = [...new Set(execs.map((e: any) => e.checklist_id))];
      const { data: criticalItems } = await supabase
        .from("checklist_items")
        .select("checklist_id")
        .in("checklist_id", checklistIds)
        .eq("is_critical", true);

      const criticalChecklistIds = new Set((criticalItems || []).map((i: any) => i.checklist_id));

      const now = new Date();
      return execs
        .filter((e: any) => criticalChecklistIds.has(e.checklist_id))
        .map((e: any) => {
          const scheduledTime = e.checklist_schedules?.start_time || null;
          let minutesLate = 0;
          if (scheduledTime) {
            const [h, m] = scheduledTime.split(":").map(Number);
            const scheduled = new Date(date);
            scheduled.setHours(h, m, 0, 0);
            minutesLate = Math.max(0, differenceInMinutes(now, scheduled));
          }
          return {
            id: e.id,
            checklistName: e.checklists?.name || "Checklist",
            sector: e.checklists?.sector || "—",
            operator: e.checklist_operators?.name || "Não atribuído",
            scheduledTime: scheduledTime || "—",
            shift: e.checklist_schedules?.shift || "—",
            status: e.status,
            minutesLate,
          };
        })
        .sort((a: any, b: any) => b.minutesLate - a.minutesLate);
    },
    enabled: !!visibleUserId,
    refetchInterval: 30000,
  });

  // Timeline (all executions of the day ordered by scheduled time)
  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ["checklist-timeline", visibleUserId, date],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const { data } = await supabase
        .from("checklist_executions")
        .select("id, status, score, checklist_id, operator_id, started_at, completed_at, checklists(name), checklist_operators(name), checklist_schedules(start_time, shift)")
        .eq("user_id", visibleUserId)
        .eq("execution_date", date);

      return (data || [])
        .map((e: any) => ({
          id: e.id,
          name: e.checklists?.name || "Checklist",
          operator: e.checklist_operators?.name || "—",
          status: e.status,
          score: e.score,
          scheduledTime: e.checklist_schedules?.start_time || "99:99",
          shift: e.checklist_schedules?.shift || "—",
          startedAt: e.started_at,
          completedAt: e.completed_at,
        }))
        .sort((a: any, b: any) => a.scheduledTime.localeCompare(b.scheduledTime));
    },
    enabled: !!visibleUserId,
    refetchInterval: 30000,
  });

  // Team highlights (week)
  const { data: teamHighlights, isLoading: highlightsLoading } = useQuery({
    queryKey: ["checklist-team-highlights", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return null;
      const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const today = format(new Date(), "yyyy-MM-dd");

      const { data: execs } = await supabase
        .from("checklist_executions")
        .select("status, score, operator_id, checklist_id, checklists(name), checklist_operators(name)")
        .eq("user_id", visibleUserId)
        .gte("execution_date", weekAgo)
        .lte("execution_date", today);

      if (!execs || execs.length === 0) return null;

      // Best & worst operators
      const opStats: Record<string, { name: string; totalScore: number; count: number; completed: number; total: number }> = {};
      const clStats: Record<string, { name: string; failed: number; total: number }> = {};

      execs.forEach((e: any) => {
        if (e.operator_id) {
          if (!opStats[e.operator_id]) {
            opStats[e.operator_id] = { name: e.checklist_operators?.name || "—", totalScore: 0, count: 0, completed: 0, total: 0 };
          }
          opStats[e.operator_id].total++;
          if (e.status === "concluido") opStats[e.operator_id].completed++;
          if (e.score != null) {
            opStats[e.operator_id].totalScore += e.score;
            opStats[e.operator_id].count++;
          }
        }

        const clId = e.checklist_id;
        if (!clStats[clId]) clStats[clId] = { name: e.checklists?.name || "Checklist", failed: 0, total: 0 };
        clStats[clId].total++;
        if (e.status === "atrasado" || e.status === "pendente" || e.status === "nao_iniciado") {
          clStats[clId].failed++;
        }
      });

      const operators = Object.values(opStats).filter(o => o.count > 0);
      const best = operators.length > 0
        ? operators.reduce((a, b) => (a.totalScore / a.count) > (b.totalScore / b.count) ? a : b)
        : null;
      const worst = operators.length > 1
        ? operators.reduce((a, b) => (a.totalScore / a.count) < (b.totalScore / b.count) ? a : b)
        : null;

      const checklists = Object.values(clStats).filter(c => c.total >= 2);
      const worstChecklist = checklists.length > 0
        ? checklists.reduce((a, b) => (a.failed / a.total) > (b.failed / b.total) ? a : b)
        : null;

      return {
        bestOperator: best ? { name: best.name, avgScore: Math.round(best.totalScore / best.count) } : null,
        worstOperator: worst && worst !== best ? { name: worst.name, avgScore: Math.round(worst.totalScore / worst.count) } : null,
        worstChecklist: worstChecklist ? { name: worstChecklist.name, failRate: Math.round((worstChecklist.failed / worstChecklist.total) * 100) } : null,
      };
    },
    enabled: !!visibleUserId,
  });

  // Alerts
  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ["checklist-alerts", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const { data, error } = await supabase
        .from("checklist_alerts")
        .select("*, checklist_executions(checklists(name)), checklist_items(title)")
        .eq("user_id", visibleUserId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!visibleUserId,
  });

  const unacknowledgedAlerts = alerts.filter((a: any) => !a.is_acknowledged);

  // Acknowledge alert
  const acknowledgeAlert = useMutation({
    mutationFn: async ({ alertId, operatorId }: { alertId: string; operatorId?: string }) => {
      const { error } = await supabase
        .from("checklist_alerts")
        .update({
          is_acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: operatorId || null,
        })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-alerts"] }),
  });

  // Health percentage
  const criticalPending = criticalTasks.length;
  const rawPct = metrics && metrics.total > 0
    ? Math.round((metrics.concluido / metrics.total) * 100)
    : metrics ? 100 : null;
  const healthPct = rawPct !== null
    ? Math.max(0, rawPct - (criticalPending * 5))
    : null;
  const healthLevel: "green" | "yellow" | "red" | null = healthPct !== null
    ? healthPct >= 90 ? "green" : healthPct >= 70 ? "yellow" : "red"
    : null;

  return {
    metrics,
    completionChart,
    shiftComparison,
    criticalTasks,
    timeline,
    teamHighlights,
    alerts,
    unacknowledgedAlerts,
    healthPct,
    healthLevel,
    acknowledgeAlert: acknowledgeAlert.mutate,
    isLoading: metricsLoading || chartLoading || shiftLoading || alertsLoading,
    metricsLoading,
    chartLoading,
    shiftLoading,
    alertsLoading,
    criticalLoading,
    timelineLoading,
    highlightsLoading,
  };
}
