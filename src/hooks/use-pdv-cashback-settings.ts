import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

export interface CashbackSettings {
  ativo: boolean;
  percentual: number;
  validade_dias: number;
  inicio_em: string | null;
  pode_configurar: boolean;
}

export function usePDVCashbackSettings() {
  const { visibleUserId, isLoading: loadingOwner } = useEstablishmentId();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["pdv-cashback-settings", visibleUserId],
    enabled: !!visibleUserId && !loadingOwner,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pdv_cashback_configuracao", { p_owner: visibleUserId! });
      if (error) throw error;
      return data as unknown as CashbackSettings;
    },
  });
  const save = useMutation({
    mutationFn: async (values: Pick<CashbackSettings, "ativo" | "percentual" | "validade_dias">) => {
      if (!visibleUserId || loadingOwner) throw new Error("Aguarde o estabelecimento carregar");
      const { data, error } = await supabase.rpc("pdv_cashback_configurar", {
        p_owner: visibleUserId,
        p_ativo: values.ativo,
        p_percentual: values.percentual,
        p_validade_dias: values.validade_dias,
      });
      if (error) throw error;
      return data as unknown as CashbackSettings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(["pdv-cashback-settings", visibleUserId], settings);
      for (const key of ["pdv-settings", "pdv-customer-cashback", "pdv-customer-credits"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success("Configuração de cashback salva");
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar o cashback"),
  });
  return { ...query, isLoading: loadingOwner || query.isLoading, save };
}
