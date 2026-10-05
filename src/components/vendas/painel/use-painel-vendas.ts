import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfMonth, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { fetchAll } from "@/lib/reports/fetch-all";
import type { PropostaStatus } from "@/lib/vendas/types";

export type UltimaProposta = {
  id: string;
  number: string;
  status: PropostaStatus;
  total: number;
  created_at: string;
  valid_until: string | null;
  cliente: string;
  representante: string | null;
};

export type RankingLinha = { id: string | null; nome: string; pedidos: number; total: number };

export type PainelVendas = {
  propostasAbertas: { qtd: number; valor: number; rascunhos: number; enviadas: number };
  conversao: { convertidas: number; respondidas: number; taxa: number | null };
  pedidosMes: { qtd: number; valor: number };
  receber: { vencidasQtd: number; vencidasValor: number; aVencerQtd: number; aVencerValor: number };
  comissoes: { qtd: number; valor: number };
  ranking: RankingLinha[];
  ultimas: UltimaProposta[];
  temRepresentantes: boolean;
};

const db = supabase as any;
const n = (v: unknown) => Number(v) || 0;

/** Painel da Força de vendas (dono, gerente e financeiro). Tudo pela chave do estabelecimento (visibleUserId). */
export function usePainelVendas() {
  const { visibleUserId: owner } = useEstablishmentId();

  return useQuery({
    queryKey: ["vendas-painel", owner],
    enabled: !!owner,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async (): Promise<PainelVendas> => {
      const agora = new Date();
      const hoje = format(agora, "yyyy-MM-dd");
      const em30 = format(addDays(agora, 30), "yyyy-MM-dd");
      const inicioMes = startOfMonth(agora).toISOString();
      const ha90 = subDays(agora, 90).toISOString();

      const [abertas, respondidas, pedidos, parcelas, comissoes, reps, ultimas] = await Promise.all([
        fetchAll<{ id: string; status: string; total: number }>((de, ate) =>
          db.from("vendas_propostas").select("id, status, total").eq("user_id", owner)
            .in("status", ["draft", "sent"]).order("id").range(de, ate)),
        // Conversão: das propostas criadas nos últimos 90 dias que já têm desfecho.
        fetchAll<{ id: string; status: string }>((de, ate) =>
          db.from("vendas_propostas").select("id, status").eq("user_id", owner).gte("created_at", ha90)
            .in("status", ["approved", "converted", "rejected", "expired"]).order("id").range(de, ate)),
        fetchAll<{ id: string; total: number; representative_id: string | null }>((de, ate) =>
          db.from("vendas_pedidos").select("id, total, representative_id").eq("user_id", owner)
            .neq("status", "cancelled").gte("confirmed_at", inicioMes).order("id").range(de, ate)),
        // Parcelas em aberto dos pedidos do módulo que vencem até daqui a 30 dias (as vencidas entram também).
        fetchAll<{ id: string; amount: number; due_date: string; status: string }>((de, ate) =>
          db.from("pdv_financial_transactions").select("id, amount, due_date, status").eq("user_id", owner)
            .eq("transaction_type", "receivable").not("vendas_pedido_id", "is", null)
            .in("status", ["pending", "overdue"]).lte("due_date", em30).order("id").range(de, ate)),
        fetchAll<{ id: string; amount: number }>((de, ate) =>
          db.from("vendas_comissoes").select("id, amount").eq("user_id", owner).eq("status", "pending")
            .order("id").range(de, ate)),
        db.from("vendas_representantes").select("id, name").eq("user_id", owner),
        db.from("vendas_propostas")
          .select("id, number, status, total, created_at, valid_until, customer:pdv_customers(name, trade_name, company_name), representative:vendas_representantes(name)")
          .eq("user_id", owner).order("created_at", { ascending: false }).limit(8),
      ]);
      if (reps.error) throw reps.error;
      if (ultimas.error) throw ultimas.error;

      const nomeRep = new Map<string, string>((reps.data ?? []).map((r: any) => [r.id, r.name]));

      const convertidas = respondidas.filter((p) => p.status === "converted" || p.status === "approved").length;

      const porRep = new Map<string | null, RankingLinha>();
      pedidos.forEach((p) => {
        const id = p.representative_id ?? null;
        const linha = porRep.get(id) ?? {
          id,
          nome: id ? nomeRep.get(id) ?? "Representante removido" : "Venda direta (sem representante)",
          pedidos: 0,
          total: 0,
        };
        linha.pedidos += 1;
        linha.total += n(p.total);
        porRep.set(id, linha);
      });

      const vencidas = parcelas.filter((t) => t.due_date < hoje || t.status === "overdue");
      const aVencer = parcelas.filter((t) => t.due_date >= hoje && t.status !== "overdue");

      return {
        propostasAbertas: {
          qtd: abertas.length,
          valor: abertas.reduce((s, p) => s + n(p.total), 0),
          rascunhos: abertas.filter((p) => p.status === "draft").length,
          enviadas: abertas.filter((p) => p.status === "sent").length,
        },
        conversao: {
          convertidas,
          respondidas: respondidas.length,
          taxa: respondidas.length ? convertidas / respondidas.length : null,
        },
        pedidosMes: { qtd: pedidos.length, valor: pedidos.reduce((s, p) => s + n(p.total), 0) },
        receber: {
          vencidasQtd: vencidas.length,
          vencidasValor: vencidas.reduce((s, t) => s + n(t.amount), 0),
          aVencerQtd: aVencer.length,
          aVencerValor: aVencer.reduce((s, t) => s + n(t.amount), 0),
        },
        comissoes: { qtd: comissoes.length, valor: comissoes.reduce((s, c) => s + n(c.amount), 0) },
        ranking: [...porRep.values()].sort((a, b) => b.total - a.total),
        ultimas: (ultimas.data ?? []).map((p: any) => ({
          id: p.id,
          number: p.number,
          status: p.status,
          total: n(p.total),
          created_at: p.created_at,
          valid_until: p.valid_until,
          cliente: p.customer?.trade_name || p.customer?.name || p.customer?.company_name || "Cliente",
          representante: p.representative?.name ?? null,
        })),
        temRepresentantes: (reps.data ?? []).length > 0,
      };
    },
  });
}
