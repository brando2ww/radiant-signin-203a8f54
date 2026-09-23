// O PostgREST corta toda resposta em 1000 linhas (PGRST_DB_MAX_ROWS=1000).
//
// Consulta de relatório sem paginação, portanto, some com venda em silêncio:
// o período curto cabe e fecha certo, o período longo estoura o teto e some
// com o resto. Foi assim que o relatório de produtos mostrou 400 unidades
// somando semana a semana e 200 e poucas puxando o período inteiro.
//
// Toda leitura de linha de venda (item, pedido, movimento de caixa) passa por
// aqui. A consulta precisa vir ordenada por uma coluna estável, senão a
// segunda página pode repetir ou pular linha.
export const PAGE_SIZE = 1000;

/** Trava de segurança: nenhum relatório legítimo passa disso. */
const HARD_LIMIT = 500_000;

export async function fetchAll<T = any>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  opts: { maxRows?: number } = {},
): Promise<T[]> {
  const teto = Math.min(opts.maxRows ?? HARD_LIMIT, HARD_LIMIT);
  const out: T[] = [];
  for (let from = 0; from < teto; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    if (out.length >= teto) break;
  }
  return out;
}
