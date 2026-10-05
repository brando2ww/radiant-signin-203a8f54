/**
 * Força de vendas · pedidos de venda (nascem da proposta aprovada). A gestão fatura, entrega e cancela; o
 * representante só lê os dele (as regras do banco garantem).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type { VendasCliente, VendasPedido, VendasPedidoItem, VendasRepresentante } from "@/lib/vendas/types";
import { buscarTodas } from "@/hooks/use-vendas-propostas";

const db = supabase as any;

export type PedidoLinha = Pick<
  VendasPedido,
  | "id" | "number" | "status" | "customer_id" | "representative_id" | "total" | "commission_percent" | "confirmed_at"
  | "invoiced_at" | "delivered_at" | "cancelled_at" | "proposta_id" | "payment_method" | "installments" | "created_at"
> & {
  customer: Pick<VendasCliente, "name" | "trade_name" | "company_name" | "city"> | null;
  rep: Pick<VendasRepresentante, "name"> | null;
};

export interface ParcelaDoPedido {
  id: string;
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: string;
  description: string | null;
  installment_number: number | null;
  installment_total: number | null;
  payment_method: string | null;
  charge_url: string | null;
  bank_slip_url: string | null;
  asaas_payment_id: string | null;
  asaas_status: string | null;
}

export type PedidoCompleto = VendasPedido & {
  customer: VendasCliente | null;
  rep: Pick<VendasRepresentante, "id" | "name" | "phone" | "email"> | null;
  proposta: { id: string; number: string; responder_name: string | null; responded_at: string | null } | null;
};

export function useVendasPedidos() {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-pedidos", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: () =>
      buscarTodas<PedidoLinha>((de, ate) =>
        db
          .from("vendas_pedidos")
          .select(
            "id, number, status, customer_id, representative_id, total, commission_percent, confirmed_at, invoiced_at, delivered_at, cancelled_at, proposta_id, payment_method, installments, created_at, customer:pdv_customers(name, trade_name, company_name, city), rep:vendas_representantes(name)",
          )
          .eq("user_id", visibleUserId)
          .order("created_at", { ascending: false })
          .range(de, ate),
      ),
  });
}

export function useVendasPedido(id: string | undefined | null) {
  return useQuery({
    queryKey: ["vendas-pedido", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: p, error }, { data: itens, error: e2 }, { data: parcelas }] = await Promise.all([
        db
          .from("vendas_pedidos")
          .select(
            "*, customer:pdv_customers(*), rep:vendas_representantes(id, name, phone, email), proposta:vendas_propostas!vendas_pedidos_proposta_id_fkey(id, number, responder_name, responded_at)",
          )
          .eq("id", id)
          .maybeSingle(),
        db.from("vendas_pedido_itens").select("*").eq("pedido_id", id).order("position"),
        // O representante não lê o financeiro: a lista volta vazia para ele e a tela mostra o cronograma previsto.
        db
          .from("pdv_financial_transactions")
          .select(
            "id, amount, due_date, payment_date, status, description, installment_number, installment_total, payment_method, charge_url, bank_slip_url, asaas_payment_id, asaas_status",
          )
          .eq("vendas_pedido_id", id)
          .eq("transaction_type", "receivable")
          .order("due_date"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      if (!p) return null;
      return {
        pedido: p as PedidoCompleto,
        itens: (itens ?? []) as VendasPedidoItem[],
        parcelas: (parcelas ?? []) as ParcelaDoPedido[],
      };
    },
  });
}

export async function faturarPedido(id: string) {
  const { error } = await db
    .from("vendas_pedidos")
    .update({ status: "invoiced", invoiced_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function entregarPedido(id: string) {
  const { error } = await db
    .from("vendas_pedidos")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelarPedido(id: string, motivo: string) {
  const { error } = await db.rpc("vendas_cancelar_pedido", { p_pedido: id, p_motivo: motivo });
  if (error) throw error;
}

export function useInvalidarPedidos() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ["vendas-pedidos"] });
    qc.invalidateQueries({ queryKey: ["vendas-propostas"] });
    if (id) qc.invalidateQueries({ queryKey: ["vendas-pedido", id] });
  };
}

export const SITUACAO_PARCELA: Record<string, string> = {
  pending: "Em aberto",
  paid: "Recebida",
  overdue: "Vencida",
  cancelled: "Cancelada",
};
