import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type { VendasAgendaItem, VendasPedido, VendasProposta } from "@/lib/vendas/types";

/** Parcela do contas a receber ligada ao cliente (pdv_financial_transactions, tipo receivable). */
export type ClienteRecebivel = {
  id: string;
  description: string | null;
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: string;
  document_number: string | null;
  installment_number: number | null;
  installment_total: number | null;
  vendas_pedido_id: string | null;
  charge_url: string | null;
};

export type ClienteHistorico = {
  propostas: VendasProposta[];
  pedidos: VendasPedido[];
  recebiveis: ClienteRecebivel[];
  agenda: VendasAgendaItem[];
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

/**
 * Propostas, pedidos, contas a receber e próximos compromissos de um cliente. Cada parte falha sozinha (o
 * representante, por exemplo, não lê o financeiro): o que não puder ser lido volta vazio.
 */
export function useVendasClienteHistorico(customerId: string | undefined) {
  const { visibleUserId } = useEstablishmentId();
  const query = useQuery({
    queryKey: ["vendas-cliente-historico", visibleUserId, customerId],
    queryFn: async (): Promise<ClienteHistorico> => {
      const agora = new Date();
      agora.setHours(0, 0, 0, 0);
      const [propostas, pedidos, recebiveis, agenda] = await Promise.all([
        supabase
          .from("vendas_propostas" as any)
          .select("*")
          .eq("user_id", visibleUserId!)
          .eq("customer_id", customerId!)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("vendas_pedidos" as any)
          .select("*")
          .eq("user_id", visibleUserId!)
          .eq("customer_id", customerId!)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("pdv_financial_transactions")
          .select(
            "id, description, amount, due_date, payment_date, status, document_number, installment_number, installment_total, vendas_pedido_id, charge_url",
          )
          .eq("user_id", visibleUserId!)
          .eq("customer_id", customerId!)
          .eq("transaction_type", "receivable")
          .order("due_date", { ascending: false })
          .limit(300),
        supabase
          .from("vendas_agenda" as any)
          .select("*")
          .eq("user_id", visibleUserId!)
          .eq("customer_id", customerId!)
          .eq("status", "scheduled")
          .gte("starts_at", agora.toISOString())
          .order("starts_at")
          .limit(50),
      ]);
      return {
        propostas: ((propostas.data ?? []) as unknown as VendasProposta[]).map((p) => ({ ...p, total: num(p.total) })),
        pedidos: ((pedidos.data ?? []) as unknown as VendasPedido[]).map((p) => ({ ...p, total: num(p.total) })),
        recebiveis: ((recebiveis.data ?? []) as unknown as ClienteRecebivel[]).map((r) => ({ ...r, amount: num(r.amount) })),
        agenda: (agenda.data ?? []) as unknown as VendasAgendaItem[],
      };
    },
    enabled: !!visibleUserId && !!customerId,
  });
  return {
    ...query,
    historico: query.data ?? { propostas: [], pedidos: [], recebiveis: [], agenda: [] },
  };
}
