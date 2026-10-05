import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { chamarFuncaoVendas } from "@/hooks/use-vendas-financeiro";

/**
 * Força de vendas · cobranças: as contas a receber (pdv_financial_transactions, tipo receivable) com a situação da
 * cobrança no Asaas. Gerar, cancelar e atualizar passam pela function `vendas-asaas` (a chave do Asaas fica no servidor).
 */

export type CobrancaCliente = {
  id: string;
  name: string;
  trade_name: string | null;
  company_name: string | null;
  contact_name: string | null;
  cnpj: string | null;
  cpf: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
};

export type CobrancaLinha = {
  id: string;
  user_id: string;
  transaction_type: "receivable" | "payable";
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: "pending" | "paid" | "cancelled" | "overdue";
  description: string;
  customer_id: string | null;
  payment_method: string | null;
  document_number: string | null;
  installment_number: number | null;
  installment_total: number | null;
  vendas_pedido_id: string | null;
  representative_id: string | null;
  asaas_payment_id: string | null;
  asaas_status: string | null;
  charge_url: string | null;
  bank_slip_url: string | null;
  pix_payload: string | null;
  charged_at: string | null;
  pdv_customers: CobrancaCliente | null;
};

export type CobrancaSituacao = "abertas" | "vencidas" | "recebidas" | "todas";

export type CobrancaTipo = "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";

export type CobrancaResultado = {
  transaction_id: string;
  ok: boolean;
  charge_url?: string;
  bank_slip_url?: string;
  pix_payload?: string;
  error?: string;
  /** A parcela já tinha cobrança: a function devolve a que existe, sem criar outra. */
  already_charged?: boolean;
};

export const COBRANCA_TIPO_LABEL: Record<CobrancaTipo, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  CREDIT_CARD: "Cartão de crédito",
  UNDEFINED: "O cliente escolhe",
};

const SELECT = `id, user_id, transaction_type, amount, due_date, payment_date, status, description, customer_id, payment_method,
  document_number, installment_number, installment_total, vendas_pedido_id, representative_id, asaas_payment_id, asaas_status,
  charge_url, bank_slip_url, pix_payload, charged_at,
  pdv_customers(id, name, trade_name, company_name, contact_name, cnpj, cpf, whatsapp, phone, email)`;

export function hojeISO() {
  return format(new Date(), "yyyy-MM-dd");
}

/** Vencida = situação "overdue" ou pendente com vencimento antes de hoje. */
export function estaVencida(t: Pick<CobrancaLinha, "status" | "due_date">) {
  return t.status === "overdue" || (t.status === "pending" && t.due_date < hojeISO());
}

export function useVendasCobrancas(opts: { situacao: CobrancaSituacao; somenteVendas: boolean }) {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-cobrancas", visibleUserId, opts.situacao, opts.somenteVendas],
    enabled: !!visibleUserId,
    queryFn: async () => {
      let q = supabase
        .from("pdv_financial_transactions")
        .select(SELECT)
        .eq("user_id", visibleUserId!)
        .eq("transaction_type", "receivable");
      if (opts.somenteVendas) q = q.not("vendas_pedido_id", "is", null);
      const hoje = hojeISO();
      if (opts.situacao === "abertas") q = q.in("status", ["pending", "overdue"]);
      else if (opts.situacao === "vencidas") q = q.or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${hoje})`);
      else if (opts.situacao === "recebidas") q = q.eq("status", "paid");
      else q = q.neq("status", "cancelled");
      const asc = opts.situacao === "abertas" || opts.situacao === "vencidas";
      const { data, error } = await q.order("due_date", { ascending: asc }).limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as CobrancaLinha[];
    },
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["vendas-cobrancas"] });
  qc.invalidateQueries({ queryKey: ["vendas-receber"] });
  qc.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
}

export function useGerarCobranca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { transaction_ids: string[]; billing_type: CobrancaTipo }) =>
      chamarFuncaoVendas<{ ok: boolean; results?: CobrancaResultado[]; error?: string }>("vendas-asaas", {
        action: "charge",
        ...v,
      }),
    onSettled: () => invalidar(qc),
  });
}

export function useCancelarCobranca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transaction_id: string) =>
      chamarFuncaoVendas<{ ok: boolean; error?: string }>("vendas-asaas", { action: "cancel", transaction_id }),
    onSettled: () => invalidar(qc),
  });
}

export function useAtualizarCobrancas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transaction_ids?: string[]) =>
      chamarFuncaoVendas<{ ok: boolean; results?: CobrancaResultado[]; updated?: number; error?: string }>("vendas-asaas", {
        action: "sync",
        ...(transaction_ids && transaction_ids.length ? { transaction_ids } : {}),
      }),
    onSettled: () => invalidar(qc),
  });
}

export function useEnviarCobranca() {
  return useMutation({
    mutationFn: (v: { id: string; channel: "whatsapp" | "email" }) =>
      chamarFuncaoVendas<{ ok: boolean; error?: string }>("vendas-enviar", { kind: "cobranca", ...v }),
  });
}

/** Nome do estabelecimento para a mensagem de cobrança. */
export function useNomeEmpresa() {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-nome-empresa", visibleUserId],
    enabled: !!visibleUserId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const [{ data: b }, { data: s }] = await Promise.all([
        supabase.from("business_settings" as any).select("business_name").eq("user_id", visibleUserId!).maybeSingle(),
        supabase.from("pdv_settings" as any).select("business_name").eq("user_id", visibleUserId!).maybeSingle(),
      ]);
      return ((b as any)?.business_name || (s as any)?.business_name || "") as string;
    },
  });
}
