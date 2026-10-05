import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type { VendasProduto } from "@/lib/vendas/types";

/**
 * Força de vendas · catálogo (pdv_products do estabelecimento). Qualquer pessoa da equipe lê; só o dono grava
 * (regra do banco que já existia). `onlyB2b` traz só o que está "no catálogo do representante".
 */

const PAGINA = 1000; // o PostgREST corta em 1000 linhas

const numOuNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

export function normalizarProduto(p: any): VendasProduto {
  const galeria = Array.isArray(p.gallery) ? p.gallery.filter((g: unknown) => typeof g === "string" && g) : [];
  return {
    ...p,
    description: p.description ?? null,
    image_url: p.image_url || null,
    price_balcao: numOuNull(p.price_balcao ?? p.price_salon),
    price_b2b: numOuNull(p.price_b2b),
    b2b_enabled: !!p.b2b_enabled,
    sku: p.sku ?? null,
    sales_unit: p.sales_unit ?? null,
    min_qty: numOuNull(p.min_qty),
    pack_qty: numOuNull(p.pack_qty),
    gallery: galeria,
    ean: p.ean ?? null,
  } as VendasProduto;
}

async function buscarProdutos(ownerId: string, onlyB2b: boolean): Promise<VendasProduto[]> {
  const todos: VendasProduto[] = [];
  for (let de = 0; ; de += PAGINA) {
    let q = supabase
      .from("pdv_products" as any)
      .select("*")
      .eq("user_id", ownerId)
      .order("category")
      .order("name")
      .order("id")
      .range(de, de + PAGINA - 1);
    if (onlyB2b) q = q.eq("b2b_enabled", true);
    const { data, error } = await q;
    if (error) throw error;
    const linhas = (data ?? []) as any[];
    todos.push(...linhas.map(normalizarProduto));
    if (linhas.length < PAGINA) break;
  }
  return todos;
}

/** Produtos do estabelecimento para a Força de vendas. Devolve o resultado do useQuery e `produtos` (lista pronta). */
export function useVendasCatalogo(opts: { onlyB2b?: boolean } = {}) {
  const { visibleUserId } = useEstablishmentId();
  const onlyB2b = !!opts.onlyB2b;
  const query = useQuery({
    queryKey: ["vendas-catalogo", visibleUserId, onlyB2b],
    queryFn: () => buscarProdutos(visibleUserId!, onlyB2b),
    enabled: !!visibleUserId,
  });
  return { ...query, produtos: query.data ?? [] };
}
