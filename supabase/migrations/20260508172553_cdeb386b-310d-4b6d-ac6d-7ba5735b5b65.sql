
ALTER TABLE public.pdv_cashier_sessions
  ADD COLUMN IF NOT EXISTS declared_online_delivery numeric,
  ADD COLUMN IF NOT EXISTS declared_other numeric,
  ADD COLUMN IF NOT EXISTS online_delivery_difference numeric,
  ADD COLUMN IF NOT EXISTS other_difference numeric,
  ADD COLUMN IF NOT EXISTS justification_online_delivery text,
  ADD COLUMN IF NOT EXISTS justification_other text,
  ADD COLUMN IF NOT EXISTS declared_total_sales numeric,
  ADD COLUMN IF NOT EXISTS total_difference numeric,
  ADD COLUMN IF NOT EXISTS closing_status text,
  ADD COLUMN IF NOT EXISTS closing_justification text;
