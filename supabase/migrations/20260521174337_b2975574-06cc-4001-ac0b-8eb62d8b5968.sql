-- Idempotency key on delivery_orders to prevent duplicate orders from double-submit / retries
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_orders_user_idempotency
  ON public.delivery_orders(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Prevent the same delivery order from generating two cashier movements (race / double click)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pdv_cashier_movements_delivery_order
  ON public.pdv_cashier_movements(delivery_order_id)
  WHERE delivery_order_id IS NOT NULL;