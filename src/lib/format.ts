/**
 * Formatação canônica de valores monetários no padrão brasileiro.
 *
 * Use SEMPRE este helper para exibir valores em reais na UI.
 * Não use `toFixed(2)` precedido de "R$" — produz formato errado (ponto em vez
 * de vírgula, sem separador de milhar).
 *
 * Exemplos:
 *   formatBRL(49)        → "R$ 49,00"
 *   formatBRL(1234.5)    → "R$ 1.234,50"
 *   formatBRL("1234.56") → "R$ 1.234,56"
 *   formatBRL(null)      → "R$ 0,00"
 *   formatBRL(-50)       → "-R$ 50,00"
 */
const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return brlFormatter.format(0);
  }
  const n = typeof value === "string" ? Number(value) : value;
  return brlFormatter.format(Number.isFinite(n) ? n : 0);
}

/** Alias compatível com código legado. */
export const formatCurrency = formatBRL;

/**
 * Variante compacta sem casas decimais — útil para chips/badges curtos
 * e ticks de gráfico. Ex.: 1234 -> "R$ 1.234".
 */
const brlCompactFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatBRLCompact(
  value: number | string | null | undefined
): string {
  if (value === null || value === undefined || value === "") {
    return brlCompactFormatter.format(0);
  }
  const n = typeof value === "string" ? Number(value) : value;
  return brlCompactFormatter.format(Number.isFinite(n) ? n : 0);
}


/**
 * Máscara de CPF conforme o usuário digita: "12345678909" → "123.456.789-09".
 * Ignora tudo que não é dígito e trunca em 11, então colar um CPF já formatado
 * (ou com espaços) funciona sem tratamento extra.
 */
export function formatCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Valida CPF pelos dígitos verificadores.
 *
 * Na NFC-e o CPF vai para a SEFAZ, que rejeita a nota inteira se o número for
 * inválido — vale barrar no caixa em vez de perder a venda no fim do fluxo.
 */
export function isValidCpf(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 11) return false;
  // Sequências repetidas (000.000.000-00, 111...) passam no cálculo mas não existem.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const dv = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
