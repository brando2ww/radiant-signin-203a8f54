import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ExecutionStatus = Database["public"]["Enums"]["checklist_execution_status"];
type AlertType = Database["public"]["Enums"]["checklist_alert_type"];

interface ExecutionItem {
  id: string;
  executionItemId: string;
  title: string;
  item_type: string;
  is_critical: boolean;
  is_required: boolean;
  requires_photo: boolean;
  min_value: number | null;
  max_value: number | null;
  training_instruction: string | null;
  training_video_url: string | null;
  value: any;
  photo_url: string | null;
  is_compliant: boolean | null;
  completed_at: string | null;
  sort_order: number;
}

interface ExecutionData {
  id: string;
  checklist_id: string;
  checklistName: string;
  status: ExecutionStatus;
  started_at: string | null;
  completed_at: string | null;
  score: number | null;
  maxDuration: number;
  items: ExecutionItem[];
}

// Determine current shift based on hour
function getCurrentShift(shifts?: { name: string; start: string; end: string }[]): string {
  const defaultShifts = [
    { name: "Abertura", start: "06:00", end: "11:00" },
    { name: "Tarde", start: "11:00", end: "17:00" },
    { name: "Fechamento", start: "17:00", end: "23:00" },
  ];
  const s = shifts || defaultShifts;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  for (const shift of s) {
    if (hhmm >= shift.start && hhmm < shift.end) return shift.name;
  }
  return s[s.length - 1]?.name || "Abertura";
}

export function useChecklistExecution(userId: string) {
  const qc = useQueryClient();

  // Fetch schedules for today assigned to operator
  const fetchAssignedSchedules = useCallback(
    async (operatorId: string, operatorSector: string, accessLevel?: string) => {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=Sun
      const todayStr = today.toISOString().split("T")[0];

      // Leaders/managers see everything (normalize defensively)
      const lvl = (accessLevel || "").trim().toLowerCase();
      const isManager = lvl === "lider" || lvl === "gestor";

      // 1) Schedules for this user
      const { data: schedules, error } = await supabase
        .from("checklist_schedules")
        .select("*, checklists(id, name, sector, is_active)")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (error) throw error;

      const filteredSchedules = (schedules || []).filter((s: any) => {
        if (s.checklists && s.checklists.is_active === false) return false;
        const days = (s.days_of_week as number[]) || [];
        if (!days.includes(dayOfWeek)) return false;

        if (isManager) return true;
        if (s.assigned_operator_id) return s.assigned_operator_id === operatorId;
        if (s.assigned_sector) return s.assigned_sector === operatorSector;
        const checklistSector = s.checklists?.sector;
        if (checklistSector) return checklistSector === operatorSector;
        return false;
      });

      // 2) Standalone (unscheduled) active checklists — visible to managers always,
      //    and to regular operators when sector matches.
      const { data: allChecklists } = await supabase
        .from("checklists")
        .select("id, name, sector, is_active")
        .eq("user_id", userId)
        .eq("is_active", true);

      const scheduledIds = new Set((schedules || []).map((s: any) => s.checklist_id));
      const standalone = (allChecklists || []).filter((c: any) => {
        if (scheduledIds.has(c.id)) return false;
        if (isManager) return true;
        return c.sector === operatorSector;
      });

      // 3) Today executions (covers both scheduled + standalone)
      const { data: existingExecs } = await supabase
        .from("checklist_executions")
        .select("id, checklist_id, schedule_id, status, started_at")
        .eq("user_id", userId)
        .eq("execution_date", todayStr);

      const fromSchedules = filteredSchedules.map((s: any) => {
        const exec = (existingExecs || []).find(
          (e: any) => e.schedule_id === s.id
        );
        return {
          scheduleId: s.id,
          checklistId: s.checklist_id,
          checklistName: s.checklists?.name || "Checklist",
          sector: s.checklists?.sector || "cozinha",
          shift: s.shift,
          startTime: s.start_time,
          maxDuration: s.max_duration_minutes,
          executionId: exec?.id || null,
          executionStatus: (exec?.status as ExecutionStatus) || null,
          isStandalone: false,
        };
      });

      const fromStandalone = standalone.map((c: any) => {
        const exec = (existingExecs || []).find(
          (e: any) => e.checklist_id === c.id && e.schedule_id === null
        );
        return {
          scheduleId: `standalone:${c.id}`,
          checklistId: c.id,
          checklistName: c.name,
          sector: c.sector || "cozinha",
          shift: "Avulso",
          startTime: "—",
          maxDuration: 60,
          executionId: exec?.id || null,
          executionStatus: (exec?.status as ExecutionStatus) || null,
          isStandalone: true,
        };
      });

      return [...fromSchedules, ...fromStandalone];
    },
    [userId]
  );

  // Start a new execution
  const startExecution = useCallback(
    async (checklistId: string, scheduleId: string, operatorId: string) => {
      const todayStr = new Date().toISOString().split("T")[0];
      const isStandalone = !scheduleId || scheduleId.startsWith("standalone:");
      const realScheduleId = isStandalone ? null : scheduleId;

      // Check if already exists
      const existingQuery = supabase
        .from("checklist_executions")
        .select("id")
        .eq("checklist_id", checklistId)
        .eq("execution_date", todayStr);
      const { data: existing } = realScheduleId
        ? await existingQuery.eq("schedule_id", realScheduleId).maybeSingle()
        : await existingQuery.is("schedule_id", null).eq("operator_id", operatorId).maybeSingle();

      if (existing) return existing.id;

      // Create execution
      const { data: exec, error } = await supabase
        .from("checklist_executions")
        .insert({
          checklist_id: checklistId,
          schedule_id: realScheduleId,
          operator_id: operatorId,
          user_id: userId,
          execution_date: todayStr,
          status: "em_andamento" as ExecutionStatus,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;

      // Create execution items for each checklist item
      const { data: items } = await supabase
        .from("checklist_items")
        .select("id")
        .eq("checklist_id", checklistId)
        .order("sort_order");

      if (items && items.length > 0) {
        await supabase.from("checklist_execution_items").insert(
          items.map((item: any) => ({
            execution_id: exec.id,
            item_id: item.id,
          }))
        );
      }

      return exec.id;
    },
    [userId]
  );

  // Load full execution data
  const loadExecution = useCallback(async (executionId: string): Promise<ExecutionData> => {
    const { data: exec, error } = await supabase
      .from("checklist_executions")
      .select("*, checklists(name), checklist_schedules(max_duration_minutes)")
      .eq("id", executionId)
      .single();

    if (error) throw error;

    const { data: execItems } = await supabase
      .from("checklist_execution_items")
      .select("*, checklist_items(*)")
      .eq("execution_id", executionId);

    const items: ExecutionItem[] = (execItems || []).map((ei: any) => ({
      id: ei.item_id,
      executionItemId: ei.id,
      title: ei.checklist_items?.title || "",
      item_type: ei.checklist_items?.item_type || "checkbox",
      is_critical: ei.checklist_items?.is_critical || false,
      is_required: ei.checklist_items?.is_required || false,
      requires_photo: ei.checklist_items?.requires_photo || false,
      min_value: ei.checklist_items?.min_value,
      max_value: ei.checklist_items?.max_value,
      training_instruction: ei.checklist_items?.training_instruction,
      training_video_url: ei.checklist_items?.training_video_url,
      value: ei.value,
      photo_url: ei.photo_url,
      is_compliant: ei.is_compliant,
      completed_at: ei.completed_at,
      sort_order: ei.checklist_items?.sort_order ?? 0,
    }));

    items.sort((a, b) => a.sort_order - b.sort_order);

    return {
      id: exec.id,
      checklist_id: exec.checklist_id,
      checklistName: (exec as any).checklists?.name || "Checklist",
      status: exec.status,
      started_at: exec.started_at,
      completed_at: exec.completed_at,
      score: exec.score,
      maxDuration: (exec as any).checklist_schedules?.max_duration_minutes || 60,
      items,
    };
  }, []);

  // Save item value
  const saveItemValue = useCallback(
    async (
      executionItemId: string,
      value: any,
      photoUrl: string | null,
      isCompliant: boolean | null
    ) => {
      const { error } = await supabase
        .from("checklist_execution_items")
        .update({
          value: value as any,
          photo_url: photoUrl,
          is_compliant: isCompliant,
          completed_at: new Date().toISOString(),
        })
        .eq("id", executionItemId);
      if (error) {
        console.error("[checklist] saveItemValue error:", error);
        throw error;
      }
    },
    []
  );

  // Create alert
  const createAlert = useCallback(
    async (
      executionId: string,
      itemId: string | null,
      alertType: AlertType,
      message: string
    ) => {
      await supabase.from("checklist_alerts").insert({
        execution_id: executionId,
        item_id: itemId,
        alert_type: alertType,
        message,
        user_id: userId,
      });
    },
    [userId]
  );

  // Auto-resolve any unacknowledged alerts for an item once it goes back in range
  const acknowledgeAlertsForItem = useCallback(
    async (executionId: string, itemId: string) => {
      await supabase
        .from("checklist_alerts")
        .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq("execution_id", executionId)
        .eq("item_id", itemId)
        .eq("is_acknowledged", false);
      qc.invalidateQueries({ queryKey: ["checklist-alerts"] });
      qc.invalidateQueries({ queryKey: ["checklist-dashboard"] });
    },
    [qc]
  );

  // Complete execution
  const completeExecution = useCallback(
    async (executionId: string) => {
      // Load items to calculate score
      const { data: execItems } = await supabase
        .from("checklist_execution_items")
        .select("*, checklist_items(is_required, item_type)")
        .eq("execution_id", executionId);

      const total = (execItems || []).length;
      const completed = (execItems || []).filter((i: any) => i.completed_at != null).length;
      const compliant = (execItems || []).filter((i: any) => i.is_compliant !== false).length;
      const score = total > 0 ? Math.round(((completed / total) * 60 + (compliant / total) * 40)) : 100;

      await supabase
        .from("checklist_executions")
        .update({
          status: "concluido" as ExecutionStatus,
          completed_at: new Date().toISOString(),
          score,
        })
        .eq("id", executionId);

      qc.invalidateQueries({ queryKey: ["checklist-executions"] });
      return score;
    },
    [qc, userId]
  );

  return {
    fetchAssignedSchedules,
    startExecution,
    loadExecution,
    saveItemValue,
    completeExecution,
    createAlert,
    getCurrentShift,
  };
}
