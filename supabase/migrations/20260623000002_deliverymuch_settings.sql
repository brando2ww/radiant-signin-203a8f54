ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS deliverymuch_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deliverymuch_email text,
  ADD COLUMN IF NOT EXISTS deliverymuch_restaurant_uuid text,
  ADD COLUMN IF NOT EXISTS deliverymuch_access_token text,
  ADD COLUMN IF NOT EXISTS deliverymuch_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS deliverymuch_auto_accept boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deliverymuch_delivery_time_min integer DEFAULT 40,
  ADD COLUMN IF NOT EXISTS deliverymuch_pickup_time_min integer DEFAULT 20;
