/**
 * Datas do módulo de compras.
 *
 * ATENÇÃO — há DUAS famílias de data aqui, e confundi-las é o erro mais comum:
 *
 *   colunas DATE  → order_date, expected_delivery, actual_delivery
 *   colunas TIMESTAMPTZ → created_at, sent_at, submitted_at, corrected_at
 *
 * Em coluna DATE, mandar `end.toISOString()` de um fim de dia local (23:59:59
 * em BRT) vira `T02:59:59Z` do DIA SEGUINTE, e o Postgres trunca para o dia
 * seguinte — o filtro passa a incluir um dia a mais. E `new Date("2026-08-01")`
 * é meia-noite UTC, que em BRT exibe 31/07. Por isso: coluna DATE se compara e
 * se formata como STRING, nunca via Date.
 *
 * Para timestamptz, use brtRange/brtDateKey de src/lib/reports-data-source.ts.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → "YYYY-MM-DD" no fuso local. Use para filtrar colunas DATE. */
export const dateOnly = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DD" → Date local (meia-noite local, sem passar por UTC). */
export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** "2026-08-11" → "11/08/2026". Sem Date no meio, sem risco de virar o dia. */
export function formatDateOnly(s: string | null | undefined): string {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Dias entre duas datas "YYYY-MM-DD". Positivo quando `b` é posterior. */
export function diffDays(a: string, b: string): number {
  const ms = parseDateOnly(b).getTime() - parseDateOnly(a).getTime();
  return Math.round(ms / 86_400_000);
}

export const addDays = (d: Date, days: number) => {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
};

export const addMonths = (d: Date, months: number) => {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
};

/**
 * Janela anterior contada em DIAS, não em milissegundos.
 * `previousPeriod` de report-period.ts subtrai 1ms, o que contra coluna DATE
 * erra um dia inteiro. Aqui o período anterior termina no dia anterior ao
 * início e tem exatamente a mesma quantidade de dias.
 */
export function prevDateWindow(start: Date, end: Date): { start: Date; end: Date } {
  const days = Math.max(1, diffDays(dateOnly(start), dateOnly(end)) + 1);
  const prevEnd = addDays(start, -1);
  return { start: addDays(prevEnd, -(days - 1)), end: prevEnd };
}

/** Está dentro do intervalo? Comparação lexicográfica de "YYYY-MM-DD". */
export const withinDateOnly = (value: string, start: string, end: string) =>
  value >= start && value <= end;
