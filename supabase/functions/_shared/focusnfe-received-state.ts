/** Estado das notas recebidas. `situacao` da NF-e não é a manifestação do destinatário. */
const manifestations: Record<string, string> = {
  pendente: "pendente", ciencia: "ciencia", confirmado: "confirmado", confirmacao: "confirmado",
  desconhecido: "desconhecido", desconhecimento: "desconhecido",
  nao_realizado: "nao_realizado", nao_realizada: "nao_realizado",
};

export function receivedInvoiceState(
  note: { nfe_completa?: unknown; manifestacao_destinatario?: unknown; situacao_manifesto?: unknown },
  previous?: { mde_status?: string | null; mde_nfe_completa?: boolean | null } | null,
) {
  const current = manifestations[String(note.manifestacao_destinatario ?? note.situacao_manifesto ?? "")];
  const stored = manifestations[previous?.mde_status ?? ""];
  const finals = ["confirmado", "desconhecido", "nao_realizado"];
  return {
    mde_status: finals.includes(current) ? current : finals.includes(stored) ? stored
      : current && current !== "pendente" ? current : stored ?? current ?? "pendente",
    mde_nfe_completa: note.nfe_completa === true || previous?.mde_nfe_completa === true,
  };
}

export function focusReceivedAccessError(status: number): string | null {
  return status === 401 || status === 403
    ? "A Focus NFe recusou o acesso à conta. Verifique a liberação do serviço e os dados da integração fiscal. A sincronização será retomada quando o acesso for restabelecido."
    : null;
}
