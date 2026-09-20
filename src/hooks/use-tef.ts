// TEF: manda o valor para a maquininha e espera a resposta.
//
// O navegador não fala com pinpad. O pedido é gravado numa fila
// (pdv_tef_requests) e quem executa é a ponte instalada no computador da loja,
// a mesma que imprime. Aqui a gente só cria o pedido e acompanha a linha até
// ela terminar.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

export type TefStatus =
  | "pending" | "processing" | "approved" | "denied" | "cancelled" | "error" | "expired";

export interface TefSettings {
  user_id: string;
  enabled: boolean;
  provider: string;
  install_id: string | null;
  terminal_label: string | null;
  timeout_seconds: number;
}

export interface TefResultado {
  nsu?: string | null;
  autorizacao?: string | null;
  bandeira?: string | null;
  cartao_final?: string | null;
  modalidade?: string | null;
  parcelas?: number | null;
  via_cliente?: string | null;
  via_estabelecimento?: string | null;
  mensagem?: string | null;
}

export function useTefSettings() {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["tef-settings", visibleUserId],
    enabled: !!visibleUserId,
    staleTime: 60_000,
    queryFn: async (): Promise<TefSettings | null> => {
      const { data, error } = await supabase
        .from("pdv_tef_settings")
        .select("user_id, enabled, provider, install_id, terminal_label, timeout_seconds")
        .eq("user_id", visibleUserId!)
        .maybeSingle();
      if (error) throw error;
      return (data as TefSettings) ?? null;
    },
  });
}

interface CobrancaParams {
  amount: number;
  paymentType: "credito" | "debito" | "voucher" | "pix";
  installments?: number;
  financing?: "avista" | "loja" | "emissor";
  sourceKind?: string | null;
  sourceId?: string | null;
}

const FINAIS: TefStatus[] = ["approved", "denied", "cancelled", "error", "expired"];

/**
 * Dispara a operação e acompanha até terminar.
 * Devolve o estado para a tela montar a espera ("Passe o cartão...").
 */
export function useTefCobranca() {
  const [status, setStatus] = useState<TefStatus | null>(null);
  const [resultado, setResultado] = useState<TefResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const cancelado = useRef(false);

  useEffect(() => () => { cancelado.current = true; }, []);

  const limpar = () => {
    setStatus(null);
    setResultado(null);
    setErro(null);
    setRequestId(null);
  };

  const cobrar = async (params: CobrancaParams): Promise<{ status: TefStatus; resultado: TefResultado | null }> => {
    cancelado.current = false;
    setStatus("pending");
    setResultado(null);
    setErro(null);

    const { data, error } = await supabase.rpc("pdv_tef_solicitar", {
      p_operation: "venda",
      p_amount: params.amount,
      p_payment_type: params.paymentType,
      p_installments: params.installments ?? 1,
      p_financing: params.financing ?? "avista",
      p_source_kind: params.sourceKind ?? null,
      p_source_id: params.sourceId ?? null,
    });
    if (error) {
      setStatus("error");
      setErro(error.message);
      return { status: "error", resultado: null };
    }
    const id = (data as any)?.request_id as string;
    setRequestId(id);

    // Acompanha a linha. A ponte costuma responder em segundos, mas quem manda
    // no tempo é o cliente na frente da maquininha.
    for (let tentativa = 0; tentativa < 240; tentativa++) {
      if (cancelado.current) break;
      await new Promise((r) => setTimeout(r, 1500));
      const { data: linha } = await supabase
        .from("pdv_tef_requests")
        .select("status, result, error_message")
        .eq("id", id)
        .maybeSingle();
      if (!linha) continue;
      const s = linha.status as TefStatus;
      setStatus(s);
      if (FINAIS.includes(s)) {
        const r = (linha.result as TefResultado) ?? null;
        setResultado(r);
        setErro(linha.error_message ?? null);
        return { status: s, resultado: r };
      }
    }
    setStatus("expired");
    setErro("A maquininha não respondeu no tempo esperado");
    return { status: "expired", resultado: null };
  };

  return { cobrar, limpar, status, resultado, erro, requestId };
}
