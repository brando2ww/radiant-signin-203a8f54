/**
 * Força de vendas · carteira de clientes do representante (app /representante).
 *
 * A RLS de pdv_customers já devolve ao representante só os clientes da carteira dele. O filtro por representative_id
 * é para a pré-visualização do dono (que enxerga todos os clientes do estabelecimento).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/reports/fetch-all";
import type { PedidoStatus, PropostaStatus, VendasAgendaItem, VendasCliente } from "@/lib/vendas/types";

export type RepClienteLista = Pick<
  VendasCliente,
  | "id"
  | "name"
  | "trade_name"
  | "company_name"
  | "city"
  | "state"
  | "district"
  | "phone"
  | "whatsapp"
  | "email"
  | "cnpj"
  | "cpf"
  | "person_type"
  | "contact_name"
  | "representative_id"
>;

const LISTA_COLS =
  "id, name, trade_name, company_name, city, state, district, phone, whatsapp, email, cnpj, cpf, person_type, contact_name, representative_id";

export function useRepClientes(ownerId: string | null, repId: string | null) {
  return useQuery({
    queryKey: ["vendas-rep-clientes", ownerId, repId ?? "todos"],
    enabled: !!ownerId,
    staleTime: 30_000,
    queryFn: async (): Promise<RepClienteLista[]> => {
      const rows = await fetchAll<RepClienteLista>((from, to) => {
        let q = supabase
          .from("pdv_customers" as any)
          .select(LISTA_COLS)
          .eq("user_id", ownerId!)
          .order("name")
          .order("id")
          .range(from, to);
        q = repId
          ? q.eq("representative_id", repId)
          : q.or("is_b2b.eq.true,representative_id.not.is.null");
        return q as any;
      });
      return rows.sort((a, b) =>
        (a.trade_name?.trim() || a.name).localeCompare(b.trade_name?.trim() || b.name, "pt-BR", { sensitivity: "base" }),
      );
    },
  });
}

export function useRepCliente(ownerId: string | null, id: string | undefined) {
  return useQuery({
    queryKey: ["vendas-rep-cliente", ownerId, id],
    enabled: !!ownerId && !!id,
    queryFn: async (): Promise<VendasCliente | null> => {
      const { data, error } = await supabase
        .from("pdv_customers" as any)
        .select("*")
        .eq("user_id", ownerId!)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as VendasCliente) ?? null;
    },
  });
}

export type RepClientePropostaLinha = {
  id: string;
  number: string;
  status: PropostaStatus;
  total: number;
  created_at: string;
  valid_until: string | null;
};
export type RepClientePedidoLinha = {
  id: string;
  number: string;
  status: PedidoStatus;
  total: number;
  confirmed_at: string;
  proposta_id: string | null;
};
export type RepClienteVisita = Pick<
  VendasAgendaItem,
  "id" | "kind" | "title" | "starts_at" | "ends_at" | "all_day" | "location" | "status"
>;

/** Propostas, pedidos e próximos compromissos do cliente. */
export function useRepClienteHistorico(ownerId: string | null, repId: string | null, customerId: string | undefined) {
  return useQuery({
    queryKey: ["vendas-rep-cliente-historico", ownerId, repId ?? "todos", customerId],
    enabled: !!ownerId && !!customerId,
    queryFn: async () => {
      const inicioHoje = new Date();
      inicioHoje.setHours(0, 0, 0, 0);

      let qp = supabase
        .from("vendas_propostas" as any)
        .select("id, number, status, total, created_at, valid_until")
        .eq("user_id", ownerId!)
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false })
        .limit(30);
      let qo = supabase
        .from("vendas_pedidos" as any)
        .select("id, number, status, total, confirmed_at, proposta_id")
        .eq("user_id", ownerId!)
        .eq("customer_id", customerId!)
        .order("confirmed_at", { ascending: false })
        .limit(30);
      let qa = supabase
        .from("vendas_agenda" as any)
        .select("id, kind, title, starts_at, ends_at, all_day, location, status")
        .eq("user_id", ownerId!)
        .eq("customer_id", customerId!)
        .eq("status", "scheduled")
        .gte("starts_at", inicioHoje.toISOString())
        .order("starts_at")
        .limit(5);
      if (repId) {
        qp = qp.eq("representative_id", repId);
        qo = qo.eq("representative_id", repId);
        qa = qa.eq("representative_id", repId);
      }
      const [p, o, a] = await Promise.all([qp, qo, qa]);
      if (p.error) throw p.error;
      if (o.error) throw o.error;
      if (a.error) throw a.error;
      return {
        propostas: (p.data ?? []) as unknown as RepClientePropostaLinha[],
        pedidos: (o.data ?? []) as unknown as RepClientePedidoLinha[],
        visitas: (a.data ?? []) as unknown as RepClienteVisita[],
      };
    },
  });
}
