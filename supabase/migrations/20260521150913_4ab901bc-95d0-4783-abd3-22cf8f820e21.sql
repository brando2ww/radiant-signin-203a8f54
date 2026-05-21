ALTER TABLE public.pdv_cashier_sessions
  ADD COLUMN IF NOT EXISTS declared_fiado numeric,
  ADD COLUMN IF NOT EXISTS fiado_difference numeric,
  ADD COLUMN IF NOT EXISTS justification_fiado text;