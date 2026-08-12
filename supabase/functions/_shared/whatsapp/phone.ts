/**
 * Normalização de telefone para envio.
 *
 * Isto estava reimplementado em 4 funções com regras diferentes: uma prefixava
 * 55 só se o número tivesse 10+ dígitos, outra prefixava sempre, outra confiava
 * no jid devolvido pelo Evolution. O caso que quebrava era o número que já vinha
 * com 55: virava 5555…, e a mensagem ia para um número inexistente.
 */
export function toWhatsAppNumber(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";

  // Já veio com DDI do Brasil e tamanho plausível (55 + DDD + 8 ou 9 dígitos).
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  // DDD + número, sem DDI.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  // Qualquer outra coisa (internacional, ramal) segue como está: prefixar 55
  // aqui é o que gerava número inválido.
  return digits;
}

/** Últimos 8 dígitos · usado para casar telefone de fornecedor no inbound. */
export const phoneSuffix = (raw: string): string =>
  (raw ?? "").replace(/\D/g, "").slice(-8);
