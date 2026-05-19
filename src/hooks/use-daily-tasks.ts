import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { toLocalDateStr } from "@/lib/date";

export type DailyTaskStatus = "pending" | "in_progress" | "done" | "overdue" | "done_late" | "skipped";

export interface DailyTask {
  id: string;
  scheduleId: string;
  checklistId: string;
  checklistName: string;
  checklistColor: string | null;
  sector: string;
  shift: string;
  startTime: string;
  maxDurationMinutes: number;
  deadlineTime: string;
  assignedOperatorId: string | null;
  assignedOperatorName: string | null;
  assignedSector: string | null;
  executionId: string | null;
  executionStatus: string | null;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
  status: DailyTaskStatus;
  hasCriticalItems: boolean;
  totalItems: number;
  completedItems: number;
}

export interface DailyMetrics {
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
  pending: number;
  progress: number;
}


function getCurrentShiftName(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return "Abertura";
  if (h >= 11 && h < 17) return "Tarde";
  return "Fechamento";
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function deriveStatus(
  executionStatus: string | null,
  startTime: string,
  maxDuration: number,
  completedAt: string | null,
  isToday: boolean,
  isPast: boolean,
): DailyTaskStatus {
  const deadline = addMinutesToTime(startTime, maxDuration);

  if (executionStatus === "concluido") {
    if (completedAt) {
      const compDate = new Date(completedAt);
      const compHhmm = `${String(compDate.getHours()).padStart(2, "0")}:${String(compDate.getMinutes()).padStart(2, "0")}`;
      if (compHhmm > deadline) return "done_late";
    }
    return "done";
  }
  if (executionStatus === "cancelado") return "skipped";
  if (executionStatus === "em_andamento") {
    if (isPast) return "overdue";
    if (isToday) {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      return hhmm > deadline ? "overdue" : "in_progress";
    }
    return "in_progress";
  }
  // No execution yet
  if (isPast) return "overdue";
  if (isToday) {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return hhmm > deadline ? "overdue" : "pending";
  }
  return "pending";
}

export function useDailyTasks(date?: string) {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();
  const prevOverdueIds = useRef<Set<string>>(new Set());

  const todayStr = toLocalDateStr(new Date());
  const targetDate = date || todayStr;
  const isToday = targetDate === todayStr;
  const isPast = targetDate < todayStr;
  // Use noon to avoid DST/timezone edge cases when computing day-of-week
  const dayOfWeek = new Date(`${targetDate}T12:00:00`).getDay();

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ["daily-tasks", visibleUserId, targetDate],
    queryFn: async (): Promise<DailyTask[]> => {
      if (!visibleUserId) return [];

      const { data: schedules, error: schedErr } = await supabase
        .from("checklist_schedules")
        .select("*, checklists(id, name, sector, color), checklist_operators(id, name)")
        .eq("user_id", visibleUserId)
        .eq("is_active", true);
      if (schedErr) throw schedErr;

      const todaySchedules = (schedules || []).filter((s: any) => {
        const days = (s.days_of_week as number[]) || [];
        return days.includes(dayOfWeek);
      });

      if (todaySchedules.length === 0) return [];

      const { data: executions, error: execErr } = await supabase
        .from("checklist_executions")
        .select("*, checklist_execution_items(id, completed_at)")
        .eq("user_id", visibleUserId)
        .eq("execution_date", targetDate);
      if (execErr) throw execErr;

      const checklistIds = [...new Set(todaySchedules.map((s: any) => s.checklist_id))];
      const { data: criticalItems } = await supabase
        .from("checklist_items")
        .select("checklist_id")
        .in("checklist_id", checklistIds)
        .eq("is_critical", true);
      const criticalChecklistIds = new Set((criticalItems || []).map((i: any) => i.checklist_id));

      const { data: itemCounts } = await supabase
        .from("checklist_items")
        .select("checklist_id")
        .in("checklist_id", checklistIds);
      const countMap: Record<string, number> = {};
      (itemCounts || []).forEach((i: any) => {
        countMap[i.checklist_id] = (countMap[i.checklist_id] || 0) + 1;
      });

      return todaySchedules.map((s: any) => {
        const exec = (executions || []).find(
          (e: any) => e.schedule_id === s.id || (e.checklist_id === s.checklist_id && !e.schedule_id)
        );
        const completedItems = exec
          ? (exec.checklist_execution_items || []).filter((i: any) => i.completed_at).length
          : 0;
        const totalItems = countMap[s.checklist_id] || 0;
        const deadline = addMinutesToTime(s.start_time, s.max_duration_minutes);

        return {
          id: exec?.id || s.id,
          scheduleId: s.id,
          checklistId: s.checklist_id,
          checklistName: s.checklists?.name || "Checklist",
          checklistColor: s.checklists?.color || null,
          sector: s.checklists?.sector || "cozinha",
          shift: s.shift || "Abertura",
          startTime: s.start_time,
          maxDurationMinutes: s.max_duration_minutes,
          deadlineTime: deadline,
          assignedOperatorId: s.assigned_operator_id,
          assignedOperatorName: s.checklist_operators?.name || null,
          assignedSector: s.assigned_sector,
          executionId: exec?.id || null,
          executionStatus: exec?.status || null,
          startedAt: exec?.started_at || null,
          completedAt: exec?.completed_at || null,
          score: exec?.score || null,
          status: deriveStatus(exec?.status || null, s.start_time, s.max_duration_minutes, exec?.completed_at || null, isToday, isPast),
          hasCriticalItems: criticalChecklistIds.has(s.checklist_id),
          totalItems,
          completedItems,
        };
      });
    },
    enabled: !!visibleUserId,
    refetchInterval: isToday ? 30000 : false,
  });

  // Toast when new tasks become overdue (only for today)
  useEffect(() => {
    if (!isToday) {
      prevOverdueIds.current = new Set();
      return;
    }
    const currentOverdue = new Set(tasks.filter(t => t.status === "overdue").map(t => t.scheduleId));
    currentOverdue.forEach(id => {
      if (!prevOverdueIds.current.has(id)) {
        const task = tasks.find(t => t.scheduleId === id);
        if (task) toast.error(`⚠️ "${task.checklistName}" está atrasada!`);
      }
    });
    prevOverdueIds.current = currentOverdue;
  }, [tasks, isToday]);

  const metrics: DailyMetrics = {
    total: tasks.length,
    done: tasks.filter(t => t.status === "done" || t.status === "done_late").length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    overdue: tasks.filter(t => t.status === "overdue").length,
    pending: tasks.filter(t => t.status === "pending").length,
    progress: tasks.length > 0
      ? Math.round((tasks.filter(t => t.status === "done" || t.status === "done_late").length / tasks.length) * 100)
      : 0,
  };

  const reassignOperator = useMutation({
    mutationFn: async ({ scheduleId, operatorId }: { scheduleId: string; operatorId: string }) => {
      const { error } = await supabase
        .from("checklist_schedules")
        .update({ assigned_operator_id: operatorId })
        .eq("id", scheduleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
      toast.success("Responsável atualizado");
    },
  });

  return {
    tasks,
    metrics,
    isLoading,
    refetch,
    currentShift: getCurrentShiftName(),
    reassignOperator: reassignOperator.mutate,
    selectedDate: targetDate,
    isToday,
    isPast,
  };
}
