/**
 * Normalização de unidade de compra.
 *
 * `pdv_purchase_order_items.unit` é texto livre, copiado do item da cotação.
 * O mesmo insumo aparece como "kg", "Kg", "quilo". Comparar preço unitário sem
 * normalizar mistura grandezas diferentes e inventa variação que não existe.
 */

const ALIASES: Record<string, string> = {
  kg: "kg", quilo: "kg", quilos: "kg", kilo: "kg", quilograma: "kg",
  g: "g", grama: "g", gramas: "g",
  l: "l", lt: "l", litro: "l", litros: "l",
  ml: "ml",
  un: "un", und: "un", unid: "un", unidade: "un", unidades: "un", pç: "un", pc: "un", peca: "un", peça: "un",
  cx: "cx", caixa: "cx", caixas: "cx",
  pct: "pct", pacote: "pct", pacotes: "pct",
  fd: "fd", fardo: "fd", fardos: "fd",
  sc: "sc", saco: "sc", sacos: "sc",
  dz: "dz", duzia: "dz", dúzia: "dz",
  bdj: "bdj", bandeja: "bdj",
  gl: "gl", galao: "gl", galão: "gl",
};

export function normalizeUnit(raw: string | null | undefined): string {
  const clean = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/\s+/g, " ");
  if (!clean) return "un";
  return ALIASES[clean] ?? clean;
}

/**
 * Unidade de embalagem, onde o preço depende do tamanho do pacote — e o tamanho
 * NÃO é registrado em lugar nenhum do sistema. Caixa de 12 e caixa de 24 do
 * mesmo insumo produzem +100% de "aumento" que é só troca de embalagem.
 */
const PACKAGING = new Set(["cx", "pct", "fd", "sc", "dz", "bdj", "gl"]);

export const isPackagingUnit = (unit: string) => PACKAGING.has(normalizeUnit(unit));

/** Chave de série de preço: comparar preço só faz sentido dentro da mesma unidade. */
export const priceKey = (ingredientId: string, unit: string | null | undefined) =>
  `${ingredientId}|${normalizeUnit(unit)}`;
