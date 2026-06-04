import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EmitNFCeItem {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  ncm?: string | null;
  cfop?: string | null;
  cest?: string | null;
  origem?: number | null;
  ean?: string | null;
  unidade?: string | null;
}

export interface EmitNFCeParams {
  user_id?: string; // owner id (when caller is staff)
  comanda_id?: string | null;
  table_id?: string | null;
  order_id?: string | null;
  cashier_session_id?: string | null;
  items: EmitNFCeItem[];
  valor_desconto?: number;
  valor_servico?: number;
  forma_pagamento: string;
  valor_pago?: number;
  troco?: number;
  parcelas?: number;
  customer?: { cpf?: string; email?: string; name?: string };
}

export interface EmitNFCeResult {
  success: boolean;
  status?: string;
  chave_acesso?: string;
  protocolo?: string;
  numero?: number;
  danfe_url?: string;
  emission_id?: string;
  motivo?: string;
  error?: string;
  missing?: string[];
}

export function useNFCeEmission() {
  const mutation = useMutation({
    mutationFn: async (params: EmitNFCeParams): Promise<EmitNFCeResult> => {
      const { data, error } = await supabase.functions.invoke("focusnfe-emitir-nfce", {
        body: params,
      });
      if (error) {
        throw new Error(error.message || "Falha ao chamar emissor de NFC-e");
      }
      return data as EmitNFCeResult;
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("NFC-e autorizada com sucesso!");
      } else if (result.missing?.length) {
        toast.error(`Pré-requisitos faltando: ${result.missing.join(", ")}`);
      } else {
        toast.error(`NFC-e rejeitada: ${result.motivo || result.error || "erro desconhecido"}`);
      }
    },
    onError: (e: any) => {
      toast.error(e.message || "Erro ao emitir NFC-e");
    },
  });

  return {
    emitNFCe: mutation.mutateAsync,
    isEmitting: mutation.isPending,
    result: mutation.data,
    reset: mutation.reset,
  };
}
