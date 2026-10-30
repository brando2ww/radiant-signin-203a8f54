export function mdeSyncErrorMessage(message?: string | null): string {
  if (/401|403|permissao_negada|gateway|token.*inv[aá]lido|recusou.*acesso/i.test(message ?? "")) {
    return "A Focus NFe está recusando o acesso à conta. Verifique a liberação do serviço e os dados da integração fiscal. A sincronização automática tentará novamente.";
  }
  return "Não foi possível sincronizar as notas na última tentativa. Use Consultar agora para tentar novamente.";
}
