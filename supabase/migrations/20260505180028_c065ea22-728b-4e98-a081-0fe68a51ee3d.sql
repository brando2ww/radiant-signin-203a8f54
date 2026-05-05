ALTER TABLE public.pdv_cashier_movements
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'salon',
  ADD COLUMN IF NOT EXISTS delivery_order_id uuid REFERENCES public.delivery_orders(id) ON DELETE SET NULL;

ALTER TABLE public.pdv_cashier_movements
  DROP CONSTRAINT IF EXISTS pdv_cashier_movements_source_check;

ALTER TABLE public.pdv_cashier_movements
  ADD CONSTRAINT pdv_cashier_movements_source_check
  CHECK (source IN ('salon','counter','delivery','delivery_online'));

CREATE INDEX IF NOT EXISTS idx_pdv_cashier_movements_session_source
  ON public.pdv_cashier_movements(cashier_session_id, source);

CREATE INDEX IF NOT EXISTS idx_pdv_cashier_movements_delivery_order
  ON public.pdv_cashier_movements(delivery_order_id)
  WHERE delivery_order_id IS NOT NULL;

ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS cashier_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cashier_session_id uuid REFERENCES public.pdv_cashier_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_cashier_pending
  ON public.delivery_orders(user_id, status, payment_status)
  WHERE cashier_confirmed_at IS NULL;