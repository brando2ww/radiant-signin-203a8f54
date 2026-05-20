
CREATE TABLE public.pdv_cashier_close_blind_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_session_id uuid NOT NULL UNIQUE REFERENCES public.pdv_cashier_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  operator_id uuid NOT NULL,
  declared_cash numeric NOT NULL DEFAULT 0,
  declared_credit numeric,
  declared_debit numeric,
  declared_pix numeric,
  declared_voucher numeric,
  declared_online_delivery numeric,
  declared_other numeric,
  declared_total numeric NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pdv_cashier_close_blind_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blind_snapshot_insert"
ON public.pdv_cashier_close_blind_snapshots
FOR INSERT
TO authenticated
WITH CHECK (
  operator_id = auth.uid()
  AND (user_id = auth.uid() OR public.is_establishment_member(user_id))
);

CREATE POLICY "blind_snapshot_select"
ON public.pdv_cashier_close_blind_snapshots
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR public.is_establishment_member(user_id)
);
