import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type { VendasAsaas } from "@/lib/vendas/types";

/**
 * Força de vendas · financeiro: conexão com o Asaas do estabelecimento e a chamada às functions do servidor.
 *
 * A chave do Asaas nunca passa pela tela depois de gravada: quem grava e quem usa é a function `vendas-asaas`,
 * com a chave de serviço. A tela só lê a linha de `vendas_asaas` (situação, ambiente, conta e os 4 últimos dígitos).
 */

export type VendasFuncao = "vendas-asaas" | "vendas-enviar";

/** Erro de chamada de function, já com a mensagem pronta para a tela. */
export class VendasFuncaoErro extends Error {
  /** A function ainda não foi publicada no servidor (ou o servidor não respondeu). */
  indisponivel: boolean;
  constructor(mensagem: string, indisponivel = false) {
    super(mensagem);
    this.name = "VendasFuncaoErro";
    this.indisponivel = indisponivel;
  }
}

// O edge runtime do self-hosted responde 500 com "worker boot error" quando a function não existe.
const FUNCAO_AUSENTE = /worker boot error|could not find an appropriate entrypoint|InvalidWorkerCreation|function not found/i;

const MENSAGEM_INDISPONIVEL: Record<VendasFuncao, string> = {
  "vendas-asaas": "O serviço de cobrança do Asaas ainda não está disponível no servidor. Tente de novo mais tarde.",
  "vendas-enviar": "O envio pelo Velara ainda não está disponível no servidor. Use o botão de abrir no WhatsApp.",
};

function lerMensagem(texto: string): string | null {
  if (!texto) return null;
  try {
    const j = JSON.parse(texto);
    return j?.error || j?.message || j?.msg || null;
  } catch {
    return texto.length < 300 ? texto : null;
  }
}

/** Chama uma function do módulo com o login de quem está na tela e devolve o JSON da resposta. */
export async function chamarFuncaoVendas<T = any>(nome: VendasFuncao, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const resp = error.context as Response | undefined;
      let texto = "";
      try {
        texto = (await resp?.clone().text()) ?? "";
      } catch {
        /* corpo já lido ou vazio */
      }
      const status = resp?.status ?? 0;
      const mensagem = FUNCAO_AUSENTE.test(texto) ? null : lerMensagem(texto);
      if (!mensagem && (status === 404 || status >= 500)) {
        throw new VendasFuncaoErro(MENSAGEM_INDISPONIVEL[nome], true);
      }
      if (status === 401 && !mensagem) throw new VendasFuncaoErro("Sua sessão expirou. Entre de novo para continuar.");
      throw new VendasFuncaoErro(mensagem || "O servidor recusou o pedido. Tente de novo.");
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      throw new VendasFuncaoErro("Não consegui falar com o servidor. Confira a internet e tente de novo.", true);
    }
    throw new VendasFuncaoErro(error.message || "Falha ao chamar o servidor.");
  }
  const r = data as any;
  // Resposta { ok: false, error } sem lista de resultados é um erro do pedido inteiro.
  if (r && typeof r === "object" && r.ok === false && r.error && !Array.isArray(r.results)) {
    throw new VendasFuncaoErro(String(r.error));
  }
  return r as T;
}

export function mensagemDeErro(e: unknown, padrao = "Algo deu errado. Tente de novo."): string {
  if (e instanceof Error && e.message) return e.message;
  return padrao;
}

// ── Conexão com o Asaas ───────────────────────────────────────────────────

export function useVendasAsaas() {
  const { visibleUserId } = useEstablishmentId();
  const query = useQuery({
    queryKey: ["vendas-asaas", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas_asaas" as any)
        .select("user_id, environment, key_hint, webhook_id, account_name, account_document, wallet_id, status, last_error, connected_at")
        .eq("user_id", visibleUserId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as VendasAsaas | null) ?? null;
    },
  });
  const asaas = query.data ?? null;
  return {
    asaas,
    conectado: asaas?.status === "connected",
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export type AsaasConectarResposta = {
  ok: boolean;
  account?: { name?: string | null; document?: string | null };
  error?: string;
  /** Conectou, mas com ressalva (ex.: o Asaas não aceitou o aviso automático de pagamento). */
  warning?: string;
};

export function useConectarAsaas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { api_key: string; environment: "production" | "sandbox" }) =>
      chamarFuncaoVendas<AsaasConectarResposta>("vendas-asaas", { action: "connect", ...v }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["vendas-asaas"] }),
  });
}

export function useDesconectarAsaas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => chamarFuncaoVendas<{ ok: boolean; error?: string; warning?: string }>("vendas-asaas", { action: "disconnect" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["vendas-asaas"] }),
  });
}

// ── Rótulos ───────────────────────────────────────────────────────────────

export const AMBIENTE_LABEL: Record<"production" | "sandbox", string> = {
  production: "Produção",
  sandbox: "Sandbox (testes)",
};

/** Situação da cobrança no Asaas (campo `asaas_status`), em português. */
export function situacaoCobranca(asaasStatus: string | null | undefined): {
  label: string;
  tom: "neutro" | "aguardando" | "pago" | "alerta" | "cancelado";
} {
  const s = (asaasStatus || "").toUpperCase();
  switch (s) {
    case "":
      return { label: "Sem cobrança", tom: "neutro" };
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
    case "APPROVED_BY_RISK_ANALYSIS":
      return { label: "Aguardando pagamento", tom: "aguardando" };
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
    case "DUNNING_RECEIVED":
      return { label: "Paga", tom: "pago" };
    case "OVERDUE":
      return { label: "Vencida", tom: "alerta" };
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
      return { label: "Estorno em andamento", tom: "alerta" };
    case "REFUNDED":
      return { label: "Estornada", tom: "cancelado" };
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return { label: "Contestada", tom: "alerta" };
    case "DUNNING_REQUESTED":
      return { label: "Em negativação", tom: "alerta" };
    case "CANCELLED":
    case "DELETED":
    case "REPROVED_BY_RISK_ANALYSIS":
      return { label: "Cancelada", tom: "cancelado" };
    default:
      return { label: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " "), tom: "neutro" };
  }
}

/**
 * Há uma cobrança no Asaas para a parcela. Mesma regra da function `vendas-asaas`: só a cobrança cancelada
 * (DELETED) libera gerar outra; nos demais casos a function devolve a que já existe.
 */
export function temCobrancaAtiva(t: { asaas_payment_id?: string | null; asaas_status?: string | null }): boolean {
  if (!t.asaas_payment_id) return false;
  return (t.asaas_status || "").toUpperCase() !== "DELETED";
}
