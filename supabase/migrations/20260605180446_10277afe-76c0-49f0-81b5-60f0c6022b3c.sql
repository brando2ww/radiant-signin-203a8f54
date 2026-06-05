-- Backfill: corrige delivery_orders.total = subtotal + delivery_fee - discount
-- somente para pedidos que ainda NÃO foram confirmados no caixa (não bagunça
-- histórico de caixa já fechado).
UPDATE public.delivery_orders
SET total = GREATEST(0, COALESCE(subtotal, 0) + COALESCE(delivery_fee, 0) - COALESCE(discount, 0)),
    updated_at = now()
WHERE cashier_confirmed_at IS NULL
  AND status NOT IN ('cancelled', 'completed')
  AND COALESCE(total, 0) <> GREATEST(0, COALESCE(subtotal, 0) + COALESCE(delivery_fee, 0) - COALESCE(discount, 0));