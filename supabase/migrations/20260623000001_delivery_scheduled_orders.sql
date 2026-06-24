ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_scheduled
  ON public.delivery_orders(user_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;
