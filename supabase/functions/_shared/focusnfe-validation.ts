interface FocusError { mensagem?: string; message?: string; erros?: { campo?: string; mensagem?: string }[] }
export function focusValidationMessage(data: FocusError, status: number) {
  const details = data.erros?.map((error) => [error.campo, error.mensagem].filter(Boolean).join(": ")).filter(Boolean);
  return details?.length ? details.join("; ") : data.mensagem || data.message || `Erro Focus (${status})`;
}

export function canReuseFocusCertificate(company: { cnpj?: string; certificado_valido_ate?: string }, cnpj: string, now = Date.now()) {
  return company.cnpj?.replace(/\D/g, "") === cnpj.replace(/\D/g, "") &&
    !!company.certificado_valido_ate && new Date(company.certificado_valido_ate).getTime() > now;
}
