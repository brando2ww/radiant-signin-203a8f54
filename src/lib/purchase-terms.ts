/**
 * Como prazo e pagamento aparecem para o fornecedor.
 *
 * O campo de pagamento é texto livre no formulário de cotação ("Ex: à vista, 30
 * dias") e a maioria digita só o número: nas respostas em produção, "14" (239
 * vezes), "7" (208) e "7/14/21" (121) vêm logo depois de "A vista". Repassar isso
 * cru faz a mensagem chegar como "Pagamento: 14", que não quer dizer nada.
 */

/** Só números e separadores: é prazo em dias e falta a palavra. */
const SO_NUMEROS = /^\d+(\s*[\/x+e-]\s*\d+)*$/i;

export function formatarPagamento(valor: string | null | undefined): string {
  const v = String(valor ?? "").trim();
  if (!v) return "A combinar";
  return SO_NUMEROS.test(v) ? `${v} dias` : v;
}

/**
 * Prazo em DATA, não em contagem.
 *
 * "3 dias" obriga o fornecedor a contar a partir de quando ele leu a mensagem —
 * que pode ser no dia seguinte. A data é a mesma gravada em `expected_delivery`.
 */
export function dataEntrega(dias: number | null | undefined): Date | null {
  if (dias == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d;
}
