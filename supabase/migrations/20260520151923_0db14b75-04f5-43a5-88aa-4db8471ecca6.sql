ALTER TABLE public.delivery_coupons
  ADD COLUMN IF NOT EXISTS per_customer_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_order_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_notes text;