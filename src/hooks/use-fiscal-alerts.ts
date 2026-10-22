import { useQuery } from "@tanstack/react-query";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { notasFiscais } from "@/lib/fiscal-db";
import { supabase } from "@/integrations/supabase/client";

/**
 * Notas que ficaram pelo caminho nas últimas 24h.
 *
 * A emissão é disparada pelo cliente (caixa ou painel de delivery), então uma
 * aba fechada no meio do caminho, uma queda de rede ou uma rejeição da SEFAZ
 * deixam a venda registrada sem cupom — e como a regra é nunca bloquear o
 * caixa por falha fiscal, alguém precisa ver isso depois. É esse o papel do
 * banner: mesma mecânica do alerta de impressora, para o gerente.
 *
 * `processando` que não virou `autorizada` em poucos minutos é tratado como
 * travado: a emissão da NFC-e é síncrona, então esse estado não deveria durar.
 */
export interface FiscalAlerts {
  rejeitadas: number;
  travadas: number;
  /**
   * Pedidos do delivery que a emissão automática não conseguiu mandar à
   * SEFAZ (ex.: produto sem NCM). Não viram nota, então não estão nas contas
   * acima. O servidor tenta de novo a cada hora: corrigir o cadastro resolve.
   */
  deliverySemNota: number;
  ultimoMotivo: string | null;
  total: number;
}

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const PROCESSANDO_STALE_MS = 5 * 60 * 1000;

export function useFiscalAlerts(): FiscalAlerts {
  const { visibleUserId } = useEstablishmentId();

  const { data } = useQuery({
    queryKey: ["fiscal-alerts", visibleUserId],
    enabled: !!visibleUserId,
    refetchInterval: 120_000,
    queryFn: async (): Promise<FiscalAlerts> => {
      const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
      const { data: rows, error } = await notasFiscais()
        .select("status, mensagem_sefaz, created_at")
        .eq("user_id", visibleUserId!)
        .eq("tipo", "nfce")
        .in("status", ["rejeitada", "denegada", "erro", "processando"])
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: tentativas } = await supabase
        .from("delivery_nfce_tentativas" as any)
        .select("erro, tentativa_em")
        .eq("user_id", visibleUserId!)
        .not("erro", "is", null)
        .gte("tentativa_em", since)
        .order("tentativa_em", { ascending: false });
      const deliverySemNota = (tentativas ?? []).length;

      const now = Date.now();
      let rejeitadas = 0;
      let travadas = 0;
      let ultimoMotivo: string | null = null;

      for (const r of (rows ?? []) as any[]) {
        if (r.status === "processando") {
          if (now - new Date(r.created_at).getTime() >= PROCESSANDO_STALE_MS) travadas += 1;
          continue;
        }
        rejeitadas += 1;
        if (!ultimoMotivo && r.mensagem_sefaz) ultimoMotivo = r.mensagem_sefaz;
      }

      if (!ultimoMotivo && deliverySemNota > 0) {
        ultimoMotivo = ((tentativas ?? [])[0] as any)?.erro ?? null;
      }

      return {
        rejeitadas,
        travadas,
        deliverySemNota,
        ultimoMotivo,
        total: rejeitadas + travadas + deliverySemNota,
      };
    },
  });

  return data ?? { rejeitadas: 0, travadas: 0, deliverySemNota: 0, ultimoMotivo: null, total: 0 };
}
