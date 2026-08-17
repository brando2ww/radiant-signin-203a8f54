/**
 * Driver da SellGrid (Z-PRO).
 *
 * Envia pelo número oficial da Velara, já conectado lá — não há instância nem
 * QR por estabelecimento. O contrato abaixo é o mesmo que a própria SellGrid usa
 * em produção (ver src/lib/whatsapp.ts naquele projeto):
 *
 *   POST {base}/v2/api/external/{apiId}       { number, body, externalKey, isClosed }
 *   POST {base}/v2/api/external/{apiId}/url   { mediaUrl, ... }   (não usado aqui)
 *   Authorization: Bearer {token}
 *
 * `externalKey` é obrigatório (a API responde 400 sem ele) e serve para casar a
 * mensagem com o registro em whatsapp_messages.
 *
 * CONSEQUÊNCIA QUE NÃO É TÉCNICA: como o número é da Velara e não do
 * restaurante, a resposta do fornecedor cai no atendimento da SellGrid, não no
 * WhatsApp do lojista. Para cotação isso é aceitável porque o fornecedor
 * responde pelo formulário do link; para conversa de verdade, não é.
 */
import type { Channel, SendOutcome } from "./types.ts";
import { toWhatsAppNumber } from "./phone.ts";

export interface SellGridEnv {
  base: string;
  apiId: string;
  token: string;
  /** Quando definido, TODA mensagem vai para este número, marcada como teste. */
  testNumber: string | null;
}

export function sellGridEnv(): SellGridEnv | null {
  const base = Deno.env.get("SELLGRID_API_BASE") ?? "https://api.sellgrid.com.br";
  const apiId = Deno.env.get("SELLGRID_API_ID");
  const token = Deno.env.get("SELLGRID_API_TOKEN");
  if (!apiId || !token) return null;
  return {
    base: base.replace(/\/+$/, ""),
    apiId,
    token,
    testNumber: Deno.env.get("SELLGRID_TEST_NUMBER") || null,
  };
}

/**
 * O erro da Meta vem enterrado numa stack de Axios serializada. Estes dois
 * ajudantes tiram dali o que serve para o lojista, e — importante — NUNCA
 * devolvem a string crua: ela contém o access_token da conta WhatsApp da
 * Velara, que a SellGrid ecoa na URL do erro.
 */
function metaErrorCode(inner: string): string {
  if (/131047|re-?engagement/i.test(inner)) return "outside_24h_window";
  if (/131026|not.*capable|invalid.*recipient/i.test(inner)) return "invalid_recipient";
  if (/132\d{3}|template/i.test(inner)) return "template_error";
  if (/status code 401|403/i.test(inner)) return "meta_auth";
  return "send_failed";
}

function metaErrorMessage(inner: string): string {
  switch (metaErrorCode(inner)) {
    case "outside_24h_window":
      return "A Meta recusou: fora da janela de 24h. Mensagem para quem não escreveu antes precisa de modelo aprovado.";
    case "invalid_recipient":
      return "Número não recebe mensagens no WhatsApp.";
    case "template_error":
      return "Problema no modelo de mensagem aprovado na Meta.";
    case "meta_auth":
      return "A conta WhatsApp da Velara recusou a autenticação. Verifique o token na SellGrid.";
    default:
      return "A Meta recusou o envio.";
  }
}

export async function sellGridSendText(
  ch: Channel,
  to: string,
  text: string,
  externalKey: string,
): Promise<SendOutcome> {
  const env = sellGridEnv();
  if (!env) {
    return {
      ok: false,
      status: "failed",
      errorCode: "sellgrid_not_configured",
      errorMessage: "Envio pelo número da Velara não está configurado no servidor.",
    };
  }

  const real = toWhatsAppNumber(to);
  if (!real || real.length < 12 || real.length > 13) {
    return { ok: false, status: "failed", errorCode: "invalid_number", errorMessage: `Número inválido: ${to}` };
  }

  // Válvula de segurança para disparo em massa: com o número de teste definido,
  // nada chega a fornecedor real, e o corpo diz para onde teria ido.
  let number = real;
  let body = text;
  if (env.testNumber) {
    const test = toWhatsAppNumber(env.testNumber);
    if (!test) {
      return {
        ok: false,
        status: "failed",
        errorCode: "invalid_test_number",
        errorMessage: "SELLGRID_TEST_NUMBER está definido mas é inválido.",
      };
    }
    body = `🧪 [TESTE · o destino real seria ${real}]\n\n${text}`;
    number = test;
  }

  if (!body.trim()) {
    return { ok: false, status: "failed", errorCode: "empty_body", errorMessage: "Mensagem vazia." };
  }

  try {
    const res = await fetch(`${env.base}/v2/api/external/${env.apiId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.token}`,
      },
      body: JSON.stringify({
        number,
        body,
        externalKey,
        // Fecha o atendimento após o envio: isto é disparo, não conversa. Sem
        // isso cada cotação abriria um ticket na fila da SellGrid.
        isClosed: true,
      }),
    });

    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      let msg = raw.slice(0, 200);
      try {
        msg = JSON.parse(raw)?.error ?? msg;
      } catch { /* resposta não-JSON */ }
      return { ok: false, status: "failed", errorCode: `http_${res.status}`, errorMessage: msg };
    }

    // ARMADILHA: a SellGrid responde HTTP 200 com success:true MESMO quando a
    // Meta recusa a mensagem — o erro real vem embutido em data.message como
    // "Message sent error: ...". Confiar no status HTTP faria o log marcar como
    // enviada uma cotação que nunca chegou ao fornecedor.
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch { /* sem corpo JSON: trata como enviado */ }

    const inner = String(parsed?.data?.message ?? "");
    if (parsed?.success === false || inner.includes("Message sent error")) {
      return {
        ok: false,
        status: "failed",
        errorCode: metaErrorCode(inner),
        errorMessage: metaErrorMessage(inner),
      };
    }

    return { ok: true, status: "sent", providerMessageId: externalKey };
  } catch (e) {
    return { ok: false, status: "failed", errorCode: "network", errorMessage: String(e) };
  }
}
