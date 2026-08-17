/**
 * Ponto único de envio de WhatsApp.
 *
 * Antes, cada uma das 5 funções montava o próprio fetch para o Evolution, com
 * sua própria normalização de telefone e seu próprio guard de configuração.
 * Nada era registrado: não havia como saber se uma cotação chegou ao fornecedor.
 *
 * Agora todo envio passa por aqui e vira uma linha em whatsapp_messages, com o
 * id do provedor. É isso que permite, na fase seguinte, receber os status de
 * entrega da Meta e saber o custo por mensagem.
 */
import type { Channel, MessageContext, SendOutcome } from "./types.ts";
import { evolutionSendText } from "./evolution.ts";
import { sellGridSendText } from "./sellgrid.ts";
import { toWhatsAppNumber } from "./phone.ts";

export * from "./types.ts";
export { resolveTenantChannel, resolveGlobalChannel } from "./resolve.ts";
export { toWhatsAppNumber, phoneSuffix } from "./phone.ts";
export { evolutionEnv } from "./evolution.ts";
export { sellGridEnv } from "./sellgrid.ts";

export async function sendText(
  service: any,
  ch: Channel,
  to: string,
  text: string,
  ctx: MessageContext,
): Promise<SendOutcome> {
  // Id gerado antes do envio: a SellGrid exige externalKey e é por ele que a
  // mensagem lá é casada com a linha daqui.
  const externalKey = crypto.randomUUID();

  const outcome =
    ch.provider === "evolution"
      ? await evolutionSendText(ch, to, text)
      : ch.provider === "sellgrid"
        ? await sellGridSendText(ch, to, text, externalKey)
        : {
            ok: false,
            status: "failed" as const,
            errorCode: "provider_unsupported",
            errorMessage: "Provedor ainda não implementado.",
          };

  await logMessage(service, ch, to, text, ctx, outcome);
  return outcome;
}

/**
 * O log nunca derruba o envio: falha ao registrar vira aviso, não erro para o
 * usuário — a mensagem já saiu.
 */
async function logMessage(
  service: any,
  ch: Channel,
  to: string,
  text: string,
  ctx: MessageContext,
  outcome: SendOutcome,
): Promise<void> {
  try {
    await service.from("whatsapp_messages").insert({
      user_id: ch.ownerId,
      connection_id: ch.connectionId,
      provider: ch.provider,
      direction: "outbound",
      purpose: ctx.purpose,
      to_phone: toWhatsAppNumber(to),
      kind: "text",
      body: ctx.redactBody ? null : text,
      provider_message_id: outcome.providerMessageId ?? null,
      status: outcome.status,
      status_at: new Date().toISOString(),
      error_code: outcome.errorCode ?? null,
      error_message: outcome.errorMessage ?? null,
      entity_type: ctx.entityType ?? null,
      entity_id: ctx.entityId ?? null,
      supplier_id: ctx.supplierId ?? null,
    });
  } catch (e) {
    console.warn("[whatsapp] falha ao registrar mensagem:", String(e));
  }
}
