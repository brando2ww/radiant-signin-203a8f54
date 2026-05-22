import { supabase } from "@/integrations/supabase/client";
import type { SelectedOption } from "@/components/pdv/ProductOptionSelector";
import type { ExpandedChild } from "@/utils/expandComposition";

/**
 * Converte as opções escolhidas pelo cliente (com linkedProductId) em
 * filhos de roteamento de cozinha — mesmo formato que expandComposition.
 *
 * - Cada item de opção que tiver `linkedProductId` vira um filho.
 * - Itens sem `linkedProductId` são ignorados (são apenas modificadores de preço).
 * - `production_center_id` é resolvido a partir do `printer_station` do
 *   produto vinculado (pdv_products.printer_station).
 *
 * Retorna [] se não houver itens vinculados.
 */
export async function expandSelectedOptions(
  selectedOptions: SelectedOption[] | undefined,
  parentQuantity: number,
  ownerUserId: string,
): Promise<ExpandedChild[]> {
  if (!selectedOptions || selectedOptions.length === 0) return [];
  if (!ownerUserId || parentQuantity <= 0) return [];

  // Coleta todos os itens com produto vinculado
  const linked = selectedOptions.flatMap((opt) =>
    opt.items.filter((i) => !!i.linkedProductId),
  );
  if (linked.length === 0) return [];

  // Busca nome + printer_station de cada produto vinculado em lote
  const ids = Array.from(new Set(linked.map((i) => i.linkedProductId as string)));
  const { data: products, error } = await supabase
    .from("pdv_products")
    .select("id, name, printer_station")
    .in("id", ids);
  if (error || !products) return [];

  const byId = new Map(products.map((p: any) => [p.id, p]));

  // Resolve centro de produção por slug (uma consulta por slug distinto)
  const stations = Array.from(
    new Set(products.map((p: any) => p.printer_station).filter(Boolean)),
  );
  const stationToCenter = new Map<string, string | null>();
  if (stations.length > 0) {
    const { data: centers } = await supabase
      .from("pdv_production_centers")
      .select("id, slug")
      .eq("user_id", ownerUserId)
      .eq("is_active", true)
      .in("slug", stations as string[]);
    (centers || []).forEach((c: any) => stationToCenter.set(c.slug, c.id));
  }

  const children: ExpandedChild[] = [];
  for (const item of linked) {
    const prod: any = byId.get(item.linkedProductId as string);
    if (!prod) continue;
    const station: string | null = prod.printer_station ?? null;
    const centerId = station ? stationToCenter.get(station) ?? null : null;
    children.push({
      product_id: prod.id,
      product_name: prod.name,
      quantity: parentQuantity,
      production_center_id: centerId,
      printer_station: station,
    });
  }
  return children;
}
