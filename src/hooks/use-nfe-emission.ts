import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EmitNFeItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  ncm?: string | null;
  cfop?: string | null;
  cest?: string | null;
  unidade?: string | null;
  ean?: string | null;
  origem?: number | null;
}

export interface NFeDestinatario {
  cnpj?: string | null;
  cpf?: string | null;
  nome: string;
  email?: string | null;
  inscricao_estadual?: string | null;
  indicador_inscricao_estadual?: number;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface EmitNFeParams {
  items: EmitNFeItem[];
  destinatario: NFeDestinatario;
  natureza_operacao?: string;
  forma_pagamento?: string;
  valor_desconto?: number;
  origem_tipo?: string;
  origem_id?: string;
}

export function useNFeEmission() {
  const emit = useMutation({
    mutationFn: async (params: EmitNFeParams) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-emitir-nfe", {
        body: params,
      });
      if (error) throw new Error(error.message || "Falha ao emitir NF-e");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { success: boolean; status: string; ref: string; emission_id: string; motivo?: string };
    },
    onSuccess: (r) => {
      if (r.status === "processando") {
        toast.success("NF-e enviada — aguardando autorização SEFAZ");
      } else if (r.status === "autorizada") {
        toast.success("NF-e autorizada!");
      } else {
        toast.error(`NF-e ${r.status}: ${r.motivo || ""}`);
      }
    },
    onError: (e: any) => toast.error(e.message || "Erro ao emitir NF-e"),
  });

  const consultar = useMutation({
    mutationFn: async ({ ref, tipo }: { ref: string; tipo: "nfe" | "nfce" }) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-consultar-nota", {
        body: { ref, tipo },
      });
      if (error) throw new Error(error.message);
      return data as { status: string; data: any };
    },
  });

  const cartaCorrecao = useMutation({
    mutationFn: async ({ ref, correcao }: { ref: string; correcao: string }) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-carta-correcao", {
        body: { ref, correcao },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { success: boolean; sequencia: number; protocolo: string };
    },
    onSuccess: (r) => toast.success(`CC-e #${r.sequencia} registrada`),
    onError: (e: any) => toast.error(e.message || "Erro ao registrar CC-e"),
  });

  return {
    emitNFe: emit.mutateAsync,
    isEmitting: emit.isPending,
    consultar: consultar.mutateAsync,
    cartaCorrecao: cartaCorrecao.mutateAsync,
    isSendingCCe: cartaCorrecao.isPending,
  };
}
