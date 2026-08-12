/**
 * Driver do Evolution API (Baileys). Não oficial: conecta por QR Code, o número
 * continua funcionando no celular, e não há custo por mensagem — em troca, a
 * Meta pode fechar o caminho a qualquer momento.
 */
import type { Channel, SendOutcome } from "./types.ts";
import { toWhatsAppNumber } from "./phone.ts";

export interface EvolutionEnv {
  url: string;
  key: string;
}

/**
 * Único guard de configuração do projeto. Antes estava copiado inline em 7
 * arquivos, em alguns duas vezes no mesmo arquivo.
 */
export function evolutionEnv(): EvolutionEnv | null {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!url || !key) return null;
  return { url, key };
}

export async function evolutionSendText(
  ch: Channel,
  to: string,
  text: string,
): Promise<SendOutcome> {
  if (!ch.evolutionUrl || !ch.evolutionKey || !ch.instanceName) {
    return {
      ok: false,
      status: "failed",
      errorCode: "not_configured",
      errorMessage: "WhatsApp não está configurado no servidor.",
    };
  }

  const number = toWhatsAppNumber(to);
  if (!number) {
    return { ok: false, status: "failed", errorCode: "invalid_number", errorMessage: "Número inválido." };
  }

  try {
    const res = await fetch(
      `${ch.evolutionUrl}/message/sendText/${encodeURIComponent(ch.instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ch.evolutionKey },
        body: JSON.stringify({ number, text }),
      },
    );

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* resposta sem corpo */
    }

    if (!res.ok) {
      return {
        ok: false,
        status: "failed",
        errorCode: `http_${res.status}`,
        errorMessage:
          data?.response?.message?.[0] ?? data?.message ?? `Evolution respondeu ${res.status}`,
      };
    }

    return { ok: true, status: "sent", providerMessageId: data?.key?.id ?? undefined };
  } catch (e) {
    return { ok: false, status: "failed", errorCode: "network", errorMessage: String(e) };
  }
}
