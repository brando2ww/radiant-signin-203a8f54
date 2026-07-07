// Link público do formulário de orçamento do fornecedor: /cotacao/:token
// (espelha src/lib/public-menu-link.ts). O token vive em pdv_quotation_supplier_links.
const SHARE_ORIGIN = "https://pdv.velaraia.app";

// Link direto do formulário (abre o app).
export function buildQuotationFormUrl(token: string, origin?: string): string {
  const o = origin ?? (typeof window !== "undefined" ? window.location.origin : SHARE_ORIGIN);
  return `${o}/cotacao/${token}`;
}

// Link COMPARTILHÁVEL (com preview rico no WhatsApp): passa pelo og-cotacao
// via rewrite do Vercel e redireciona o fornecedor ao formulário.
export function buildShareableQuotationUrl(token: string, origin?: string): string {
  const o = origin ?? (typeof window !== "undefined" ? window.location.origin : SHARE_ORIGIN);
  return `${o}/l/cotacao/${token}`;
}
