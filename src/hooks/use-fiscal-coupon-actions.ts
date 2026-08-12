import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Ações sobre cupons NFC-e — todas via FocusNFE.
//
// O `ref` que as edge functions esperam é o `referencia_focusnfe` da nota (a
// string gerada na emissão, que a Focus indexa), NÃO o id da linha. Antes daqui
// ia o UUID da emissão, então cancelar e consultar nunca encontravam a nota.

export function useCancelNFCe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { ref: string; justificativa: string }) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-cancelar-nota", {
        body: { ref: params.ref, tipo: "nfce", justificativa: params.justificativa },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Falha ao cancelar cupom");
      return data;
    },
    onSuccess: () => {
      toast.success("Cupom cancelado com sucesso");
      qc.invalidateQueries({ queryKey: ["fiscal-coupons"] });
      qc.invalidateQueries({ queryKey: ["fiscal-notas"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao cancelar cupom"),
  });
}

export function useCheckNFCeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { ref: string }) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-consultar-nota", {
        body: { ref: params.ref, tipo: "nfce" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Falha ao consultar status");
      return data;
    },
    onSuccess: (data) => {
      if (data?.status) toast.success(`Status atualizado: ${data.status}`);
      qc.invalidateQueries({ queryKey: ["fiscal-coupons"] });
      qc.invalidateQueries({ queryKey: ["fiscal-notas"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao consultar status"),
  });
}

/**
 * Reemite uma nota rejeitada.
 *
 * Reaproveita os itens da tentativa anterior mas relê os dados fiscais atuais
 * dos produtos — é isso que torna o botão útil: a rejeição típica é "produto
 * sem NCM", o operador corrige o cadastro e reemite.
 */
export function useResendNFCe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { nota_id: string }) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-emitir-nfce", {
        body: { reemitir_de: params.nota_id },
      });
      if (error) throw new Error(error.message);
      if (data?.error && !data?.missing) throw new Error(String(data.error));
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.success) {
        toast.success("NFC-e reemitida e autorizada");
      } else if (data?.missing?.length) {
        toast.error(`Ainda faltam dados fiscais: ${data.missing.join(", ")}`);
      } else {
        toast.error(`Reemissão rejeitada: ${data?.motivo || "erro desconhecido"}`);
      }
      qc.invalidateQueries({ queryKey: ["fiscal-coupons"] });
      qc.invalidateQueries({ queryKey: ["fiscal-notas"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao reemitir cupom"),
  });
}
