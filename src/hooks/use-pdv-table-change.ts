import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function usePDVTableChange() {
  const queryClient = useQueryClient();

  const changeTable = useMutation({
    mutationFn: async (input: {
      sourceTableId: string;
      targetTableId: string;
      reason?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("pdv_change_table", {
        p_source_table_id: input.sourceTableId,
        p_target_table_id: input.targetTableId,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      toast.success(data?.merged ? "Mesas mescladas" : "Mesa trocada");
    },
    onError: (e: Error) => toast.error("Erro ao trocar mesa: " + e.message),
  });

  return {
    changeTable: changeTable.mutateAsync,
    isChanging: changeTable.isPending,
  };
}
