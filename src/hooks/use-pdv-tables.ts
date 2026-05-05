import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

export type PDVTableStatus = 
  | "livre" 
  | "ocupada" 
  | "aguardando_pedido" 
  | "aguardando_cozinha" 
  | "pediu_conta" 
  | "pendente_pagamento";

export interface PDVTable {
  id: string;
  user_id: string;
  table_number: string;
  capacity: number;
  status: PDVTableStatus;
  position_x: number | null;
  position_y: number | null;
  shape: string;
  current_order_id: string | null;
  merged_with: string | null;
  sector_id: string | null;
  is_active: boolean;
  is_virtual?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function usePDVTables() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  const { data: tables, isLoading } = useQuery({
    queryKey: ["pdv-tables", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("pdv_tables")
        .select("*")
        .eq("user_id", visibleUserId)
        .eq("is_active", true)
        .order("position_x", { ascending: true, nullsFirst: false })
        .order("table_number");

      if (error) throw error;
      return data as PDVTable[];
    },
    enabled: !!visibleUserId,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  // Query para mesas deletadas (lixeira)
  const { data: deletedTables, isLoading: isLoadingDeleted } = useQuery({
    queryKey: ["pdv-tables-deleted", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("pdv_tables")
        .select("*")
        .eq("user_id", visibleUserId)
        .eq("is_active", false)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data as PDVTable[];
    },
    enabled: !!visibleUserId,
  });

  const createTable = useMutation({
    mutationFn: async (table: Omit<PDVTable, "id" | "user_id" | "created_at" | "updated_at">) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("pdv_tables")
        .insert({ ...table, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      toast.success("Mesa criada com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao criar mesa: " + error.message);
    },
  });

  const updateTable = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PDVTable> }) => {
      // Não usamos .single() porque, em alguns papéis (garçom), o RLS pode
      // permitir o UPDATE mas restringir o retorno do SELECT pós-update,
      // gerando "Cannot coerce the result to a single JSON object".
      const { data, error } = await supabase
        .from("pdv_tables")
        .update(updates)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data ?? ({ id, ...updates } as PDVTable);
    },
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["pdv-tables", visibleUserId] });

      // Snapshot previous value for rollback
      const previousTables = queryClient.getQueryData<PDVTable[]>(["pdv-tables", visibleUserId]);

      // Optimistically update the cache (use visibleUserId — garçons compartilham
      // o cache do dono do estabelecimento, não o do próprio usuário)
      queryClient.setQueryData<PDVTable[]>(
        ["pdv-tables", visibleUserId],
        (old) => old?.map(table =>
          table.id === id ? { ...table, ...updates } : table
        ) ?? []
      );

      return { previousTables };
    },
    onError: (error: any, _variables, context) => {
      // Rollback on error
      if (context?.previousTables) {
        queryClient.setQueryData(["pdv-tables", visibleUserId], context.previousTables);
      }
      toast.error("Erro ao atualizar mesa: " + error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
    },
  });

  const deleteTable = useMutation({
    mutationFn: async (id: string) => {
      // Soft delete - apenas marca como inativa
      const { error } = await supabase
        .from("pdv_tables")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-tables-deleted"] });
      toast.success("Mesa movida para a lixeira");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover mesa: " + error.message);
    },
  });

  const restoreTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pdv_tables")
        .update({ is_active: true })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-tables-deleted"] });
      toast.success("Mesa restaurada com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao restaurar mesa: " + error.message);
    },
  });

  const permanentDeleteTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pdv_tables")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-tables-deleted"] });
      toast.success("Mesa excluída permanentemente");
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir mesa: " + error.message);
    },
  });

  const mergeTables = useMutation({
    mutationFn: async ({ tableId1, tableId2 }: { tableId1: string; tableId2: string }) => {
      // Update both tables to reference each other
      const { error: error1 } = await supabase
        .from("pdv_tables")
        .update({ merged_with: tableId2 })
        .eq("id", tableId1);
      
      if (error1) throw error1;

      const { error: error2 } = await supabase
        .from("pdv_tables")
        .update({ merged_with: tableId1 })
        .eq("id", tableId2);
      
      if (error2) throw error2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      toast.success("Mesas unidas com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao unir mesas: " + error.message);
    },
  });

  const unmergeTables = useMutation({
    mutationFn: async (tableId: string) => {
      const table = tables?.find(t => t.id === tableId);
      if (!table?.merged_with) return;

      // Remove merge reference from both tables
      const { error: error1 } = await supabase
        .from("pdv_tables")
        .update({ merged_with: null })
        .eq("id", tableId);
      
      if (error1) throw error1;

      const { error: error2 } = await supabase
        .from("pdv_tables")
        .update({ merged_with: null })
        .eq("id", table.merged_with);
      
      if (error2) throw error2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      toast.success("Mesas separadas com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao separar mesas: " + error.message);
    },
  });

  return {
    tables: tables || [],
    isLoading,
    deletedTables: deletedTables || [],
    isLoadingDeleted,
    createTable: createTable.mutate,
    isCreating: createTable.isPending,
    updateTable: updateTable.mutate,
    isUpdating: updateTable.isPending,
    deleteTable: deleteTable.mutate,
    isDeleting: deleteTable.isPending,
    restoreTable: restoreTable.mutate,
    isRestoring: restoreTable.isPending,
    permanentDeleteTable: permanentDeleteTable.mutate,
    isPermanentDeleting: permanentDeleteTable.isPending,
    mergeTables: mergeTables.mutate,
    isMerging: mergeTables.isPending,
    unmergeTables: unmergeTables.mutate,
    isUnmerging: unmergeTables.isPending,
  };
}
