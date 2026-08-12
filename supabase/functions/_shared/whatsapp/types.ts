// Tipos da camada de WhatsApp. Um provedor a mais (Meta Cloud API) entra aqui
// sem tocar em nenhum call site.

export type Provider = "evolution" | "cloud";

/** Por onde a mensagem sai. Resolvido uma vez, por tenant ou global. */
export interface Channel {
  provider: Provider;
  /** null = canal global da plataforma (2FA, verificação de número). */
  ownerId: string | null;
  connectionId: string | null;
  // evolution
  instanceName?: string;
  evolutionUrl?: string;
  evolutionKey?: string;
  // cloud (ainda não usado; entra na fase 1)
  phoneNumberId?: string;
  accessToken?: string;
  graphVersion?: string;
}

export type SendStatus = "queued" | "sent" | "failed";

export interface SendOutcome {
  ok: boolean;
  status: SendStatus;
  /** wamid.* na Cloud, key.id no Baileys. */
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export type MessagePurpose =
  | "quotation"
  | "supplier_order"
  | "tasks_report"
  | "two_factor"
  | "phone_verification";

export interface MessageContext {
  purpose: MessagePurpose;
  entityType?: string;
  entityId?: string;
  supplierId?: string;
  /** Não persistir o corpo. Usado onde o texto carrega segredo (código 2FA). */
  redactBody?: boolean;
}

/** Erro que o resolver devolve quando não há por onde enviar. */
export interface ChannelError {
  error: SendOutcome;
}

export const isChannelError = (v: Channel | ChannelError): v is ChannelError =>
  (v as ChannelError).error !== undefined;
