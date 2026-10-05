/**
 * Força de vendas · resumo do dia do representante (tela "Hoje").
 *
 * Propostas abertas (rascunho, enviada, aprovada aguardando virar pedido), vendas do mês (pedidos não cancelados
 * confirmados no mês) e comissão do mês (comissões não canceladas recebidas no mês). A RLS já limita o
 * representante ao que é dele; o filtro por representative_id serve para a pré-visualização do dono.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/reports/fetch-all";
import { currentMonthRange } from "@/components/vendas/rep/rep-utils";
import type { PropostaStatus } from "@/lib/vendas/types";

export const PROPOSTA_ABERTA: PropostaStatus[] = ["draft", "sent", "approved"];

export type RepPropostaResumo = {
  id: string;
  number: string;
  status: PropostaStatus;
  total: number;
  valid_until: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  created_at: string;
  customer_id: string;
  customer: { name: string; trade_name: string | null } | null;
};

export type RepResumo = {
  abertas: { count: number; total: number; rascunhos: number; enviadas: number };
  aguardando: RepPropostaResumo[];
  vendasMes: { count: number; total: number };
  comissaoMes: { total: number; pendente: number; paga: number };
};

export function useVendasRepResumo(ownerId: string | null, repId: string | null) {
  const mes = currentMonthRange();
  return useQuery({
    queryKey: ["vendas-rep-resumo", ownerId, repId ?? "todos", mes.key],
    enabled: !!ownerId,
    queryFn: async (): Promise<RepResumo> => {
      const pPropostas = fetchAll<RepPropostaResumo>((from, to) => {
        let q = supabase
          .from("vendas_propostas" as any)
          .select("id, number, status, total, valid_until, sent_at, viewed_at, created_at, customer_id, customer:pdv_customers(name, trade_name)")
          .eq("user_id", ownerId!)
          .in("status", PROPOSTA_ABERTA)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to);
        if (repId) q = q.eq("representative_id", repId);
        return q as any;
      });

      const pPedidos = fetchAll<{ total: number }>((from, to) => {
        let q = supabase
          .from("vendas_pedidos" as any)
          .select("id, total")
          .eq("user_id", ownerId!)
          .neq("status", "cancelled")
          .gte("confirmed_at", mes.startIso)
          .lt("confirmed_at", mes.nextStartIso)
          .order("id")
          .range(from, to);
        if (repId) q = q.eq("representative_id", repId);
        return q as any;
      });

      const pComissoes = fetchAll<{ amount: number; status: string }>((from, to) => {
        let q = supabase
          .from("vendas_comissoes" as any)
          .select("id, amount, status")
          .eq("user_id", ownerId!)
          .neq("status", "cancelled")
          .gte("received_at", mes.startDate)
          .lte("received_at", mes.endDate)
          .order("id")
          .range(from, to);
        if (repId) q = q.eq("representative_id", repId);
        return q as any;
      });

      const [propostas, pedidos, comissoes] = await Promise.all([pPropostas, pPedidos, pComissoes]);
      const soma = (arr: { [k: string]: any }[], k: string) => arr.reduce((s, r) => s + Number(r[k] || 0), 0);

      return {
        abertas: {
          count: propostas.length,
          total: soma(propostas, "total"),
          rascunhos: propostas.filter((p) => p.status === "draft").length,
          enviadas: propostas.filter((p) => p.status === "sent").length,
        },
        aguardando: propostas.filter((p) => p.status === "sent").slice(0, 3),
        vendasMes: { count: pedidos.length, total: soma(pedidos, "total") },
        comissaoMes: {
          total: soma(comissoes, "amount"),
          pendente: soma(comissoes.filter((c) => c.status === "pending"), "amount"),
          paga: soma(comissoes.filter((c) => c.status === "paid"), "amount"),
        },
      };
    },
  });
}
