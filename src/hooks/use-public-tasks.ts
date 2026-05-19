import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TaskInstance, ShiftConfig } from "./use-operational-tasks";
import { toLocalDateStr } from "@/lib/date";

export function usePublicTasks(userId: string) {
  const qc = useQueryClient();
  const today = toLocalDateStr();

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["public-task-instances", userId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operational_task_instances")
        .select("*")
        .eq("user_id", userId)
        .eq("task_date", today)
        .order("shift")
        .order("title");
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        templateId: row.template_id,
        userId: row.user_id,
        taskDate: row.task_date,
        title: row.title,
        description: row.description,
        shift: row.shift,
        assignedTo: row.assigned_to,
        requiresPhoto: row.requires_photo,
        status: row.status,
        completedBy: row.completed_by,
        completedAt: row.completed_at,
        photoUrl: row.photo_url,
        notes: row.notes,
        createdAt: row.created_at,
      })) as TaskInstance[];
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  const { data: settings } = useQuery({
    queryKey: ["public-task-settings", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operational_task_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? {
        shifts: (data.shifts as any) as ShiftConfig[],
        qrCodeEnabled: data.qr_code_enabled,
      } : null;
    },
    enabled: !!userId,
  });

  const completeTask = useMutation({
    mutationFn: async ({ id, completedBy, photoUrl, notes }: { id: string; completedBy?: string; photoUrl?: string; notes?: string }) => {
      const { error } = await supabase
        .from("operational_task_instances")
        .update({
          status: "done",
          completed_by: completedBy || null,
          completed_at: new Date().toISOString(),
          photo_url: photoUrl || null,
          notes: notes || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-task-instances"] });
    },
  });

  return {
    instances,
    isLoading,
    settings,
    completeTask: completeTask.mutate,
    isCompleting: completeTask.isPending,
  };
}
