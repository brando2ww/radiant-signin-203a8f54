import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

/**
 * Relatórios de clientes e fidelidade.
 *
 * LIMITE QUE PRECISA ESTAR NA TELA: `pdv_comandas` guarda só o NOME do cliente,
 * não o id. Então a receita POR PERÍODO por cliente só existe onde há vínculo
 * de verdade — o delivery, via `delivery_orders.customer_id`. Os números de
 * vida (total gasto, visitas, última visita) vêm do cadastro e incluem o salão
 * quando o operador identificou a pessoa no caixa.
 *
 * Misturar as duas coisas em silêncio daria um "gasto no período" que ora
 * inclui salão, ora não. Aqui elas ficam em colunas separadas.
 */

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  source: "pdv" | "delivery";
  /** Vida inteira, do cadastro. */
  totalSpent: number;
  visitCount: number;
  lastVisit: string | null;
  /** Dias desde a última compra registrada. */
  diasSemComprar: number | null;
  ticketMedio: number;
  /** Só delivery, dentro do período filtrado. */
  pedidosNoPeriodo: number;
  receitaNoPeriodo: number;
}

export interface RedemptionRow {
  id: string;
  customerName: string;
  prizeName: string;
  kind: string;
  pointsCost: number;
  discountAmount: number;
  status: string;
  createdAt: string;
}

export interface CustomerReportData {
  clientes: CustomerRow[];
  totalBase: number;
  ativosNoPeriodo: number;
  inativos: CustomerRow[];
  receitaNoPeriodo: number;
  resgates: RedemptionRow[];
  pontosGastos: number;
  custoDosResgates: number;
}

/** Sem compra há mais de 60 dias é o corte usual para "sumiu". */
export const DIAS_INATIVO = 60;

export function useCustomerReports(startDate: Date, endDate: Date) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery<CustomerReportData>({
    queryKey: ["report-customers", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const [pdvRes, deliveryRes, pedidosRes, resgatesRes] = await Promise.all([
        supabase
          .from("pdv_customers")
          .select("id, name, phone, total_spent, visit_count, last_visit")
          .eq("user_id", visibleUserId!),
        supabase.from("delivery_customers").select("id, name, phone"),
        supabase
          .from("delivery_orders")
          .select("customer_id, customer_name, customer_phone, total, created_at, status")
          .eq("user_id", visibleUserId!)
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString()),
        supabase
          .from("delivery_loyalty_redemptions")
          .select("id, prize_name, kind, points_cost, discount_amount, status, created_at, customer_id")
          .eq("user_id", visibleUserId!)
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString())
          .order("created_at", { ascending: false }),
      ]);

      if (pdvRes.error) throw pdvRes.error;
      if (pedidosRes.error) throw pedidosRes.error;

      // Pedido cancelado não é receita, e contar como visita distorce a
      // recorrência de quem só desistiu.
      const pedidos = (pedidosRes.data ?? []).filter((p) => p.status !== "cancelled");

      const porCliente = new Map<string, { pedidos: number; receita: number; ultima: string }>();
      const porTelefone = new Map<string, { pedidos: number; receita: number; ultima: string }>();
      pedidos.forEach((p) => {
        const valor = Number(p.total) || 0;
        const acc = (m: Map<string, { pedidos: number; receita: number; ultima: string }>, k: string) => {
          if (!k) return;
          const a = m.get(k) ?? { pedidos: 0, receita: 0, ultima: p.created_at };
          a.pedidos += 1;
          a.receita += valor;
          if (p.created_at > a.ultima) a.ultima = p.created_at;
          m.set(k, a);
        };
        acc(porCliente, p.customer_id ?? "");
        acc(porTelefone, (p.customer_phone ?? "").replace(/\D/g, ""));
      });

      const agora = Date.now();
      const dias = (iso: string | null) =>
        iso ? Math.floor((agora - new Date(iso).getTime()) / 86_400_000) : null;

      const vistos = new Set<string>();
      const clientes: CustomerRow[] = [];

      (pdvRes.data ?? []).forEach((c) => {
        const tel = (c.phone ?? "").replace(/\D/g, "");
        if (tel) vistos.add(tel);
        const p = (tel && porTelefone.get(tel)) || { pedidos: 0, receita: 0, ultima: "" };
        const gasto = Number(c.total_spent) || 0;
        const visitas = Number(c.visit_count) || 0;
        // A última compra é a mais recente entre cadastro e delivery do período.
        const ultima = [c.last_visit, p.ultima].filter(Boolean).sort().pop() ?? null;
        clientes.push({
          id: c.id,
          name: c.name,
          phone: c.phone,
          source: "pdv",
          totalSpent: gasto,
          visitCount: visitas,
          lastVisit: ultima,
          diasSemComprar: dias(ultima),
          ticketMedio: visitas > 0 ? gasto / visitas : 0,
          pedidosNoPeriodo: p.pedidos,
          receitaNoPeriodo: p.receita,
        });
      });

      (deliveryRes.data ?? []).forEach((d) => {
        const tel = (d.phone ?? "").replace(/\D/g, "");
        if (tel && vistos.has(tel)) return; // já veio pelo cadastro do PDV
        const p = porCliente.get(d.id) ?? (tel ? porTelefone.get(tel) : undefined) ??
          { pedidos: 0, receita: 0, ultima: "" };
        clientes.push({
          id: d.id,
          name: d.name,
          phone: d.phone,
          source: "delivery",
          totalSpent: p.receita,
          visitCount: p.pedidos,
          lastVisit: p.ultima || null,
          diasSemComprar: dias(p.ultima || null),
          ticketMedio: p.pedidos > 0 ? p.receita / p.pedidos : 0,
          pedidosNoPeriodo: p.pedidos,
          receitaNoPeriodo: p.receita,
        });
      });

      clientes.sort((a, b) => b.totalSpent - a.totalSpent);

      const inativos = clientes
        .filter((c) => c.visitCount > 0 && (c.diasSemComprar ?? 9999) > DIAS_INATIVO)
        .sort((a, b) => b.totalSpent - a.totalSpent);

      const resgates: RedemptionRow[] = (resgatesRes.data ?? []).map((r) => ({
        id: r.id,
        customerName:
          clientes.find((c) => c.id === r.customer_id)?.name ?? "Cliente",
        prizeName: r.prize_name,
        kind: r.kind,
        pointsCost: Number(r.points_cost) || 0,
        discountAmount: Number(r.discount_amount) || 0,
        status: r.status,
      createdAt: r.created_at,
      }));

      // Só resgate aplicado custou dinheiro. Reservado e cancelado, não.
      const aplicados = resgates.filter((r) => r.status === "applied");

      return {
        clientes,
        totalBase: clientes.length,
        ativosNoPeriodo: clientes.filter((c) => c.pedidosNoPeriodo > 0).length,
        inativos,
        receitaNoPeriodo: clientes.reduce((s, c) => s + c.receitaNoPeriodo, 0),
        resgates,
        pontosGastos: aplicados.reduce((s, r) => s + r.pointsCost, 0),
        custoDosResgates: aplicados.reduce((s, r) => s + r.discountAmount, 0),
      };
    },
  });
}
