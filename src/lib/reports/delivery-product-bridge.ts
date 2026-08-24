import { supabase } from "@/integrations/supabase/client";

/**
 * Ponte entre o catálogo do delivery e o do PDV.
 *
 * São duas tabelas separadas: `delivery_order_items.product_id` aponta para
 * `delivery_products`, e NENHUM desses ids existe em `pdv_products` (conferido
 * em produção: 0 de 1972 itens casam). Somar delivery no relatório de produtos
 * sem resolver isso cria uma linha órfã por produto — sem categoria, sem ficha
 * técnica, e portanto com custo zero e margem de 100%.
 *
 * A ponte é `delivery_products.source_pdv_product_id`, preenchida quando o
 * produto do delivery nasce de um produto do PDV. Em produção ela alcança
 * 4599 de 4616 itens vendidos (99,6%); o casamento por nome cobre a diferença.
 */

export interface DeliveryProductBridge {
  /** id do delivery → id do produto no PDV. `null` quando não há equivalente. */
  resolve: (deliveryProductId: string | null, productName?: string | null) => string | null;
  /** Produtos de delivery que não alcançaram nenhum produto do PDV. */
  semEquivalente: Set<string>;
}

const normalizar = (t: string): string =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

export async function buildDeliveryProductBridge(
  ownerUserId: string,
  pdvProducts: Array<{ id: string; name: string }>,
): Promise<DeliveryProductBridge> {
  const { data } = await supabase
    .from("delivery_products")
    .select("id, name, source_pdv_product_id")
    .eq("user_id", ownerUserId);

  const pdvIds = new Set(pdvProducts.map((p) => p.id));
  const porNome = new Map(pdvProducts.map((p) => [normalizar(p.name), p.id]));

  const mapa = new Map<string, string>();
  const semEquivalente = new Set<string>();

  (data ?? []).forEach((d) => {
    // 1. Vínculo explícito, que é o caminho certo — mas só vale se o produto
    //    de origem ainda existir; produto do PDV apagado deixa o id órfão.
    const origem = d.source_pdv_product_id;
    if (origem && pdvIds.has(origem)) {
      mapa.set(d.id, origem);
      return;
    }
    // 2. Rede: mesmo nome, sem acento nem caixa.
    const porNomeId = porNome.get(normalizar(d.name ?? ""));
    if (porNomeId) {
      mapa.set(d.id, porNomeId);
      return;
    }
    semEquivalente.add(d.id);
  });

  return {
    resolve: (deliveryProductId, productName) => {
      if (deliveryProductId) {
        const achou = mapa.get(deliveryProductId);
        if (achou) return achou;
      }
      // Item antigo sem product_id: resta o nome gravado na linha do pedido.
      if (productName) {
        const porNomeId = porNome.get(normalizar(productName));
        if (porNomeId) return porNomeId;
      }
      return null;
    },
    semEquivalente,
  };
}
