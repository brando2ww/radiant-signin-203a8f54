ALTER TABLE public.pdv_cashier_sessions
  ADD COLUMN IF NOT EXISTS opened_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS closed_by_user_id uuid;

UPDATE public.pdv_cashier_sessions
   SET opened_by_user_id = user_id
 WHERE opened_by_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cashier_sessions_opened_by
  ON public.pdv_cashier_sessions(opened_by_user_id);