ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS cancellation_category text NULL,
  ADD COLUMN IF NOT EXISTS customer_notified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid NULL;