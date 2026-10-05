import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type { VendasComissao, VendasRepresentante } from "@/lib/vendas/types";

/**
 * Força de vendas · comissões. A comissão nasce quando a parcela do pedido é recebida (gatilho no banco) e é paga
 * pela gestão com `vendas_pagar_comissoes`, que lança UM pagamento por representante no contas a pagar.
 * O representante só enxerga as dele (a política do banco filtra).
 */

export type ComissaoLinha = VendasComissao & {
  vendas_representantes: { id: string; name: string } | null;
  vendas_pedidos: {
    id: string;
    number: string;
    customer_id: string;
    pdv_customers: { id: string; name: string; trade_name: string | null; company_name: string | null } | null;
  } | null;
};

const SELECT = `*, vendas_representantes(id, name),
  vendas_pedidos(id, number, customer_id, pdv_customers(id, name, trade_name, company_name))`;

export function nomeClienteComissao(c: ComissaoLinha) {
  const cli = c.vendas_pedidos?.pdv_customers;
  return cli?.trade_name || cli?.name || cli?.company_name || "Cliente";
}

/** Comissões da empresa (gestão), recebidas no período escolhido. Sem período = todas. */
export function useVendasComissoes(periodo: { de: Date; ate: Date } | null) {
  const { visibleUserId } = useEstablishmentId();
  const de = periodo ? format(periodo.de, "yyyy-MM-dd") : null;
  const ate = periodo ? format(periodo.ate, "yyyy-MM-dd") : null;
  return useQuery({
    queryKey: ["vendas-comissoes", visibleUserId, de, ate],
    enabled: !!visibleUserId,
    queryFn: async () => {
      let q = supabase.from("vendas_comissoes" as any).select(SELECT).eq("user_id", visibleUserId!);
      if (de) q = q.gte("received_at", de);
      if (ate) q = q.lte("received_at", ate);
      const { data, error } = await q.order("received_at", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as ComissaoLinha[];
    },
  });
}

/**
 * Comissões no app do representante. Para o representante a política do banco já limita às dele; na pré-visualização
 * do dono, o filtro por representante vem do app (repId null = todos).
 */
export function useMinhasComissoes(ownerId: string | null | undefined, repId: string | null | undefined) {
  return useQuery({
    queryKey: ["vendas-minhas-comissoes", ownerId, repId ?? null],
    enabled: !!ownerId,
    queryFn: async () => {
      let q = supabase.from("vendas_comissoes" as any).select(SELECT).eq("user_id", ownerId!);
      if (repId) q = q.eq("representative_id", repId);
      const { data, error } = await q
        .order("received_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as ComissaoLinha[];
    },
  });
}

export function useRepresentantesLista() {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-representantes-lista", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas_representantes" as any)
        .select("id, name, commission_percent, is_active")
        .eq("user_id", visibleUserId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Pick<VendasRepresentante, "id" | "name" | "commission_percent" | "is_active">[];
    },
  });
}

export type PagarComissoesResposta = {
  paid: number;
  payables: { representative_id: string; name: string; amount: number; count: number; payable_id: string | null }[];
};

export function usePagarComissoes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { ids: string[]; data: Date }) => {
      const { data, error } = await supabase.rpc("vendas_pagar_comissoes" as any, {
        p_ids: v.ids,
        p_data: format(v.data, "yyyy-MM-dd"),
      });
      if (error) throw new Error(error.message);
      return data as unknown as PagarComissoesResposta;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas-comissoes"] });
      qc.invalidateQueries({ queryKey: ["vendas-minhas-comissoes"] });
      qc.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
    },
  });
}
