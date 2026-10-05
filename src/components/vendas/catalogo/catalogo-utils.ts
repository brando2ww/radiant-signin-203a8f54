import type { VendasProduto } from "@/lib/vendas/types";

/** Preço que o representante oferece: o de representante, ou o de balcão quando não houver. */
export function precoVenda(p: Pick<VendasProduto, "price_b2b" | "price_balcao">): number {
  return Number(p.price_b2b ?? p.price_balcao ?? 0);
}

/** Quantidade sem zeros sobrando: 12 → "12", 2.5 → "2,5". */
export function formatarQtd(v: number | null | undefined): string {
  if (v == null) return "";
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** Todas as fotos do produto, a principal primeiro e sem repetir. */
export function fotosProduto(p: Pick<VendasProduto, "image_url" | "gallery">): string[] {
  const lista = [p.image_url, ...(p.gallery ?? [])].filter((u): u is string => !!u);
  return Array.from(new Set(lista));
}

/** Unidades comuns de venda no atacado (o campo é livre). */
export const UNIDADES_SUGERIDAS = ["un", "cx", "fardo", "pacote", "kg", "g", "L", "ml", "m", "dz", "par", "saco", "galão", "lata", "garrafa"];
