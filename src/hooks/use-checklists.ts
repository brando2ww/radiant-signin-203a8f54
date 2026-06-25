import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type ChecklistRow = Database["public"]["Tables"]["checklists"]["Row"];
type ChecklistInsert = Database["public"]["Tables"]["checklists"]["Insert"];
type ChecklistItemRow = Database["public"]["Tables"]["checklist_items"]["Row"];
type ChecklistItemInsert = Database["public"]["Tables"]["checklist_items"]["Insert"];

export type ChecklistSector = Database["public"]["Enums"]["checklist_sector"];
export type ChecklistItemType = Database["public"]["Enums"]["checklist_item_type"];

export const SECTOR_LABELS: Record<ChecklistSector, string> = {
  cozinha: "Cozinha",
  salao: "Salão",
  caixa: "Caixa",
  bar: "Bar",
  estoque: "Estoque",
  gerencia: "Gerência",
};

export const ITEM_TYPE_LABELS: Record<ChecklistItemType, string> = {
  checkbox: "Marcar como feito",
  number: "Número",
  text: "Texto",
  photo: "Foto",
  temperature: "Temperatura",
  stars: "Avaliação (estrelas)",
  multiple_choice: "Múltipla escolha",
};

export function useChecklists() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const { data: checklists = [], isLoading } = useQuery({
    queryKey: ["checklists", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const { data, error } = await supabase
        .from("checklists")
        .select("*")
        .eq("user_id", visibleUserId)
        .eq("is_template", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ChecklistRow[];
    },
    enabled: !!visibleUserId,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["checklist-templates", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const { data, error } = await supabase
        .from("checklists")
        .select("*, checklist_items(*)")
        .eq("user_id", visibleUserId)
        .eq("is_template", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!visibleUserId,
  });

  const createChecklist = useMutation({
    mutationFn: async (input: Omit<ChecklistInsert, "user_id">) => {
      if (!visibleUserId) throw new Error("Sem usuário");
      const { data, error } = await supabase
        .from("checklists")
        .insert({ ...input, user_id: visibleUserId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      toast({ title: "Checklist criado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateChecklist = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ChecklistRow> & { id: string }) => {
      const { error } = await supabase.from("checklists").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      toast({ title: "Checklist atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteChecklist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      toast({ title: "Checklist excluído" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const duplicateChecklist = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!visibleUserId) throw new Error("Sem usuário");
      // Fetch source + items
      const { data: src, error: srcErr } = await supabase
        .from("checklists")
        .select("*, checklist_items(*)")
        .eq("id", sourceId)
        .single();
      if (srcErr || !src) throw srcErr || new Error("Não encontrado");

      // Create copy
      const { data: copy, error: copyErr } = await supabase
        .from("checklists")
        .insert({
          user_id: visibleUserId,
          name: `${src.name} (cópia)`,
          sector: src.sector,
          description: src.description,
          is_template: false,
        })
        .select()
        .single();
      if (copyErr || !copy) throw copyErr;

      // Copy items
      const items = (src as any).checklist_items as ChecklistItemRow[];
      if (items?.length) {
        const newItems = items.map((item) => ({
          checklist_id: copy.id,
          title: item.title,
          item_type: item.item_type,
          is_critical: item.is_critical,
          is_required: item.is_required,
          requires_photo: item.requires_photo,
          sort_order: item.sort_order,
          min_value: item.min_value,
          max_value: item.max_value,
          training_instruction: item.training_instruction,
          training_video_url: item.training_video_url,
          options: (item as any).options ?? null,
        }));
        await supabase.from("checklist_items").insert(newItems);
      }
      return copy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      toast({ title: "Checklist duplicado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return {
    checklists,
    templates,
    isLoading,
    createChecklist: createChecklist.mutateAsync,
    updateChecklist: updateChecklist.mutate,
    deleteChecklist: deleteChecklist.mutate,
    duplicateChecklist: duplicateChecklist.mutate,
    isCreating: createChecklist.isPending,
  };
}

export function useChecklistItems(checklistId: string | null) {
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["checklist-items", checklistId],
    queryFn: async () => {
      if (!checklistId) return [];
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("checklist_id", checklistId)
        .order("sort_order");
      if (error) throw error;
      return data as ChecklistItemRow[];
    },
    enabled: !!checklistId,
  });

  const upsertItem = useMutation({
    mutationFn: async (item: ChecklistItemInsert & { id?: string }) => {
      if (item.id) {
        const { id, ...updates } = item;
        const { error } = await supabase.from("checklist_items").update(updates).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("checklist_items").insert(item);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-items", checklistId] }),
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-items", checklistId] }),
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const reorderItems = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase.from("checklist_items").update({ sort_order: index }).eq("id", id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-items", checklistId] }),
  });

  return {
    items,
    isLoading,
    upsertItem: upsertItem.mutateAsync,
    deleteItem: deleteItem.mutate,
    reorderItems: reorderItems.mutate,
  };
}
