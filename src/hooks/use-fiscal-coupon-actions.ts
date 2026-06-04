import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Hooks de ações sobre cupons NFC-e — todas usam o provedor FocusNFE.
// O `ref` enviado às edge functions Focus corresponde ao id da emissão local
// (pdv_nfce_emissions.id), que é a referência usada na hora da emissão.

export function useCancelNFCe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { emission_id: string; justificativa: string }) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-cancelar-nota", {
        body: { ref: params.emission_id, tipo: "nfce", justificativa: params.justificativa },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Falha ao cancelar cupom");
      return data;
    },
    onSuccess: () => {
      toast.success("Cupom cancelado com sucesso");
      qc.invalidateQueries({ queryKey: ["fiscal-coupons"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao cancelar cupom"),
  });
}

export function useCheckNFCeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { emission_id: string }) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-consultar-nota", {
        body: { ref: params.emission_id, tipo: "nfce" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Falha ao consultar status");
      return data;
    },
    onSuccess: (data) => {
      if (data?.status) toast.success(`Status atualizado: ${data.status}`);
      qc.invalidateQueries({ queryKey: ["fiscal-coupons"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao consultar status"),
  });
}

// Reenvio automático não é mais suportado — a venda deve ser refeita no PDV
// para gerar uma nova emissão FocusNFE com payload válido.
export function useResendNFCe() {
  return useMutation({
    mutationFn: async (_params: { emission_id: string }) => {
      throw new Error(
        "Reenvio automático indisponível. Refaça a venda no PDV para gerar uma nova NFC-e.",
      );
    },
    onError: (e: any) => toast.error(e.message),
  });
}
