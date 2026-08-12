import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EmitNFCeItem {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal?: number;
  ncm?: string | null;
  cfop?: string | null;
  cest?: string | null;
  origem?: string | number | null;
  ean?: string | null;
  unidade?: string | null;
  csosn?: string | null;
  cst_icms?: string | null;
  icms_rate?: number | null;
  pis_cst?: string | null;
  pis_rate?: number | null;
  cofins_cst?: string | null;
  cofins_rate?: number | null;
}

export interface EmitNFCePagamento {
  /** Aceita o rótulo do PDV ("dinheiro", "pix") ou o código do SEFAZ ("01"). */
  forma_pagamento: string;
  valor: number;
  parcelas?: number | null;
  bandeira?: string | null;
}

export interface EmitNFCeParams {
  items: EmitNFCeItem[];
  valor_desconto?: number;
  /** Taxa de serviço; só entra na nota se o estabelecimento tiver optado. */
  valor_servico?: number;
  /** Taxa de entrega do delivery. */
  valor_frete?: number;
  pagamentos: EmitNFCePagamento[];
  customer?: { cpf?: string; email?: string; name?: string };
  /** false = entrega a domicílio (presença 4 na NFC-e). */
  presencial?: boolean;
  /** Vínculo com a venda: comanda | table | delivery_order. */
  origem_tipo?: string;
  origem_id?: string;
  informacoes_adicionais?: string;
}

export interface EmitNFCeResult {
  success: boolean;
  status?: string;
  chave_acesso?: string;
  protocolo?: string;
  numero?: number;
  serie?: string;
  qrcode?: string;
  url_consulta?: string;
  valor_total?: number;
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
