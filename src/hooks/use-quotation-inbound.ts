import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

/**
 * Respostas de fornecedores recebidas via WhatsApp (caixa de entrada de cotação).
 * Alimentada pela edge function whatsapp-transactions → pdv_quotation_inbound_messages.
 * Atualiza em tempo real (Realtime).
 *
 * Regra de exibição: UMA resposta por fornecedor. A edge já mantém 1 linha
 * pendente por fornecedor (acumulando o texto), mas o hook agrupa de novo por
 * segurança — se sobrar alguma duplicata, mostramos só a mais recente e as
 * ações (ignorar/confirmar) valem para todas as linhas daquele fornecedor.
 */
export interface InboundMessage {
  id: string;
  /** todas as linhas desse fornecedor (para ignorar/confirmar em lote) */
  ids: string[];
  supplier_id: string | null;
  quotation_request_id: string | null;
  from_phone: string;
  body: string | null;
  status: string;
  received_at: string;
  supplier?: { name: string } | null;
  request?: { request_number: string | null } | null;
}

interface RawInbound extends Omit<InboundMessage, "ids"> {}

export function useQuotationInbound(opts: { realtime?: boolean } = {}) {
  const realtime = opts.realtime ?? true;
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  // id único por montagem (permite usar o hook no menu e na página sem colidir canal)
  const channelId = useRef(Math.random().toString(36).slice(2)).current;

  const query = useQuery({
    queryKey: ["quotation-inbound", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<RawInbound[]> => {
      const { data, error } = await supabase
        .from("pdv_quotation_inbound_messages")
        .select("*, supplier:pdv_suppliers(name), request:pdv_quotation_requests(request_number)")
        .eq("user_id", visibleUserId!)
        .eq("status", "pending")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  // Agrupa por fornecedor: 1 card por fornecedor (o mais recente), com todos os ids.
  const messages = useMemo<InboundMessage[]>(() => {
    const rows = query.data ?? [];
    const bySupplier = new Map<string, InboundMessage>();
    for (const r of rows) {
      const key = r.supplier_id ?? `phone:${r.from_phone}`;
      const existing = bySupplier.get(key);
      if (existing) {
        existing.ids.push(r.id);
        // mantém o vínculo de cotação se algum registro tiver
        if (!existing.quotation_request_id && r.quotation_request_id) {
          existing.quotation_request_id = r.quotation_request_id;
          existing.request = r.request;
        }
      } else {
        bySupplier.set(key, { ...r, ids: [r.id] });
      }
    }
    return Array.from(bySupplier.values());
  }, [query.data]);

  useEffect(() => {
    if (!visibleUserId || !realtime) return;
    const channel = supabase
      .channel(`quotation-inbound-${visibleUserId}-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pdv_quotation_inbound_messages",
          filter: `user_id=eq.${visibleUserId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["quotation-inbound", visibleUserId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [visibleUserId, queryClient, realtime, channelId]);

  const setStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: "confirmed" | "ignored" }) => {
      const { error } = await supabase
        .from("pdv_quotation_inbound_messages")
        .update({ status })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotation-inbound", visibleUserId] });
    },
    onError: () => toast.error("Erro ao atualizar a resposta recebida"),
  });

  const toIds = (arg: string | string[]) => (Array.isArray(arg) ? arg : [arg]);

  return {
    messages,
    isLoading: query.isLoading,
    ignore: (ids: string | string[]) => setStatus.mutate({ ids: toIds(ids), status: "ignored" }),
    markConfirmed: (ids: string | string[]) => setStatus.mutateAsync({ ids: toIds(ids), status: "confirmed" }),
  };
}
