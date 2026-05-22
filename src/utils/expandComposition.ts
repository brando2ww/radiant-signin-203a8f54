import { supabase } from "@/integrations/supabase/client";
import { resolveProductionCenterId } from "@/utils/resolveProductionCenter";

export interface ExpandedChild {
  product_id: string;
  product_name: string;
  quantity: number;
  production_center_id: string | null;
  printer_station: string | null;
  composition_group_label?: string | null;
  composition_position?: number | null;
}

/**
 * Para um produto composto, busca seus sub-produtos e resolve o
 * production_center_id de cada filho (com base em pdv_products.printer_station).
 *
 * Retorna [] se o produto não é composto ou não tem composição cadastrada.
 * `parentQuantity` multiplica a quantidade base de cada filho.
 */
export async function expandComposition(
  parentProductId: string,
  parentQuantity: number,
  ownerUserId: string,
): Promise<ExpandedChild[]> {
  if (!parentProductId || !ownerUserId || parentQuantity <= 0) return [];

  // Confere se é composto
  const { data: parent } = await supabase
    .from("pdv_products")
    .select("is_composite")
    .eq("id", parentProductId)
    .maybeSingle();

  if (!parent?.is_composite) return [];

  const { data: comps, error } = await supabase
    .from("pdv_product_compositions")
    .select(
      `id, quantity, order_position, child_product:pdv_products!pdv_product_compositions_child_product_id_fkey(id, name, printer_station)`,
    )
    .eq("parent_product_id", parentProductId)
    .order("order_position", { ascending: true });

  if (error || !comps) return [];

  const children: ExpandedChild[] = [];
  let idx = 0;
  for (const c of comps as any[]) {
    const child = c.child_product;
    if (!child) continue;
    const center = await resolveProductionCenterId(child.id, ownerUserId);
    children.push({
      product_id: child.id,
      product_name: child.name,
      quantity: Number(c.quantity) * parentQuantity,
      production_center_id: center,
      printer_station: child.printer_station ?? null,
      composition_group_label: null,
      composition_position: Number(c.order_position ?? idx),
    });
    idx++;
  }
  return children;
}
