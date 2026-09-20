/** Corpo do e-mail de recuperação de senha, usado pelos dois caminhos:
 *  pedido por e-mail (send-password-reset) e por documento
 *  (reset-password-by-document). */
export function corpoDoEmailDeSenha(link: string, nome?: string | null): string {
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8f8f5;padding:24px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-top:3px solid #f5c400;border-radius:10px;padding:28px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Redefinir sua senha</h1>
      <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">${saudacao}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        Recebemos um pedido para criar uma nova senha na sua conta. Clique no botão abaixo para escolher a senha nova.
      </p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="${link}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Criar nova senha
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6;">
        O link vale por 1 hora. Se você não pediu isso, pode ignorar esta mensagem: sua senha atual continua valendo.
      </p>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;word-break:break-all;">${link}</p>
    </div>
  </div>`;
}
