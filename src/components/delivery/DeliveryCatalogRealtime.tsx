import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

/**
 * Keeps the delivery catalog (admin views and queue) live without page reloads.
 */
export function DeliveryCatalogRealtime() {
  const { visibleUserId } = useEstablishmentId();
  const userFilter = visibleUserId ? `user_id=eq.${visibleUserId}` : undefined;

  useRealtimeInvalidate({
    channel: `delivery-catalog:${visibleUserId ?? "anon"}`,
    enabled: !!visibleUserId,
    tables: [
      {
        table: "delivery_products",
        keys: [["delivery-products"], ["shared-delivery-product-ids"]],
        filter: userFilter,
      },
      {
        table: "delivery_categories",
        keys: [["delivery-categories"]],
        filter: userFilter,
      },
      {
        table: "delivery_product_options",
        keys: [["product-options"], ["delivery-option-recipes"]],
      },
      {
        table: "delivery_product_option_items",
        keys: [["product-options"], ["delivery-option-recipes"]],
      },
    ],
  });

  return null;
}
