import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

/**
 * Mount once near the top of PDV/Garçom areas to keep the cashier's product
 * catalog (products, options, items, compositions) in sync with edits made
 * elsewhere — without forcing a page refresh.
 */
export function PDVCatalogRealtime() {
  const { visibleUserId } = useEstablishmentId();
  const userFilter = visibleUserId ? `user_id=eq.${visibleUserId}` : undefined;

  useRealtimeInvalidate({
    channel: `pdv-catalog:${visibleUserId ?? "anon"}`,
    enabled: !!visibleUserId,
    tables: [
      {
        table: "pdv_products",
        keys: [["pdv-products"]],
        filter: userFilter,
      },
      // Options/items don't have user_id directly — invalidate broadly; the
      // queries are already keyed by productId so the impact is minimal.
      {
        table: "pdv_product_options",
        keys: [["pdv-product-options"], ["product-options"]],
      },
      {
        table: "pdv_product_option_items",
        keys: [["pdv-product-options"], ["product-options"]],
      },
      {
        table: "pdv_product_compositions",
        keys: [["pdv-compositions"]],
      },
      {
        table: "pdv_product_composition_groups",
        keys: [["pdv-composition-groups"], ["pdv-compositions"]],
      },
    ],
  });

  return null;
}
