import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

interface Props {
  userId: string | undefined;
}

/**
 * Keeps the public menu (/cardapio/<slug>) reactive to catalog edits made by
 * the restaurant — no manual refresh needed by customers viewing the page.
 */
export function PublicMenuRealtime({ userId }: Props) {
  const filter = userId ? `user_id=eq.${userId}` : undefined;

  useRealtimeInvalidate({
    channel: `public-menu:${userId ?? "anon"}`,
    enabled: !!userId,
    tables: [
      {
        table: "delivery_products",
        keys: [["public-products", userId], ["public-menu"]],
        filter,
      },
      {
        table: "delivery_categories",
        keys: [["public-categories", userId], ["public-menu"]],
        filter,
      },
      {
        table: "delivery_product_options",
        keys: [["public-products", userId], ["public-menu"]],
      },
      {
        table: "delivery_product_option_items",
        keys: [["public-products", userId], ["public-menu"]],
      },
    ],
  });

  return null;
}
