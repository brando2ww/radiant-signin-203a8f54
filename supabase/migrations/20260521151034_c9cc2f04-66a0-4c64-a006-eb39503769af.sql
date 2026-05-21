ALTER TABLE public.pdv_cashier_close_blind_snapshots
  ADD COLUMN IF NOT EXISTS declared_fiado numeric;