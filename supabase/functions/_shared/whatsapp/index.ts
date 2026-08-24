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
import { sellGridSendText, sellGridSendTemplate } from "./sellgrid.ts";
import type { TemplateSpec } from "./template-spec.ts";
import { toWhatsAppNumber } from "./phone.ts";

export * from "./types.ts";
export { resolveTenantChannel, resolveGlobalChannel } from "./resolve.ts";
export { toWhatsAppNumber, phoneSuffix } from "./phone.ts";
export { evolutionEnv } from "./evolution.ts";
export { sellGridEnv } from "./sellgrid.ts";
export { achatarParametro, montarTemplateData, conferirTemplate } from "./template-spec.ts";
export type { TemplateSpec } from "./template-spec.ts";

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
 * Envia um MODELO aprovado na Meta.
 *
 * Só faz sentido em canal oficial: no Evolution (QR) não existe modelo, tudo é
 * texto livre. Por isso o provedor errado aqui é erro explícito, e não um
 * silencioso "mandei como texto" — que passaria pela janela de 24h sem avisar
 * ninguém e chegaria diferente do que o lojista viu na tela.
 */
export async function sendTemplate(
  service: any,
  ch: Channel,
  to: string,
  spec: TemplateSpec,
  ctx: MessageContext,
): Promise<SendOutcome> {
  const externalKey = crypto.randomUUID();

  const outcome =
    ch.provider === "sellgrid"
      ? await sellGridSendTemplate(ch, to, spec, externalKey)
      : {
          ok: false,
          status: "failed" as const,
          errorCode: "provider_no_template",
          errorMessage:
            "Modelo aprovado só sai pelo número oficial. Esta conexão é por QR Code.",
        };

  await logMessage(service, ch, to, null, ctx, outcome, spec);
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
  text: string | null,
  ctx: MessageContext,
  outcome: SendOutcome,
  spec?: TemplateSpec,
): Promise<void> {
  try {
    await service.from("whatsapp_messages").insert({
      user_id: ch.ownerId,
      connection_id: ch.connectionId,
      provider: ch.provider,
      direction: "outbound",
      purpose: ctx.purpose,
      to_phone: toWhatsAppNumber(to),
      kind: spec ? "template" : "text",
      template_name: spec?.name ?? null,
      template_language: spec?.language ?? null,
      // Guarda os valores enviados: é o que permite reconstruir depois a
      // mensagem exata que o fornecedor viu.
      template_variables: spec
        ? { body: spec.bodyParams, url_button: spec.urlButtonParam ?? null }
        : null,
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
