import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "./use-establishment-id";
import { toast } from "sonner";

export type NotaTipo = "nfce" | "nfe" | "nfse";
export type NotaStatus = "processando" | "autorizada" | "rejeitada" | "cancelada" | "denegada" | "erro";

export interface NotaFiscal {
  id: string;
  user_id: string;
  tipo: NotaTipo;
  ambiente: string;
  referencia_focusnfe: string;
  numero?: string | null;
  serie?: string | null;
  chave_acesso?: string | null;
  protocolo?: string | null;
  status: NotaStatus;
  valor_total: number;
  destinatario_nome?: string | null;
  destinatario_documento?: string | null;
  destinatario_email?: string | null;
  caminho_xml?: string | null;
  caminho_danfe?: string | null;
  payload_enviado?: any;
  resposta_api?: any;
  origem_tipo?: string | null;
  origem_id?: string | null;
  cancelamento_justificativa?: string | null;
  cancelada_em?: string | null;
  mensagem_sefaz?: string | null;
  emitida_em?: string | null;
  created_at: string;
}

export interface NotasFilter {
  tipo?: NotaTipo;
  status?: NotaStatus;
  from?: string;
  to?: string;
  search?: string;
}

export function useFiscalNotas(filter: NotasFilter = {}) {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["fiscal-notas", visibleUserId, filter],
    queryFn: async () => {
      if (!visibleUserId) return [];
      let q = supabase
        .from("notas_fiscais" as any)
        .select("*")
        .eq("user_id", visibleUserId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter.tipo) q = q.eq("tipo", filter.tipo);
      if (filter.status) q = q.eq("status", filter.status);
      if (filter.from) q = q.gte("created_at", filter.from);
      if (filter.to) q = q.lte("created_at", filter.to);
      if (filter.search) {
        q = q.or(
          `chave_acesso.ilike.%${filter.search}%,numero.ilike.%${filter.search}%,destinatario_nome.ilike.%${filter.search}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as any) as NotaFiscal[];
    },
    enabled: !!visibleUserId,
  });

  const cancelar = useMutation({
    mutationFn: async ({ ref, tipo, justificativa }: { ref: string; tipo: NotaTipo; justificativa: string }) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-cancelar-nota", {
        body: { ref, tipo, justificativa },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-notas"] });
      toast.success("Nota cancelada");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao cancelar"),
  });

  const consultar = useMutation({
    mutationFn: async ({ ref, tipo }: { ref: string; tipo: NotaTipo }) => {
      const { data, error } = await supabase.functions.invoke("focusnfe-consultar-nota", {
        body: { ref, tipo },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-notas"] }),
  });

  return {
    notas: query.data || [],
    isLoading: query.isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: ["fiscal-notas"] }),
    cancelar: cancelar.mutateAsync,
    isCancelling: cancelar.isPending,
    consultar: consultar.mutateAsync,
  };
}

export function useCartasCorrecao(notaId?: string) {
  return useQuery({
    queryKey: ["fiscal-cartas-correcao", notaId],
    queryFn: async () => {
      if (!notaId) return [];
      const { data, error } = await supabase
        .from("notas_fiscais_cartas_correcao" as any)
        .select("*")
        .eq("nota_id", notaId)
        .order("sequencia", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!notaId,
  });
}
