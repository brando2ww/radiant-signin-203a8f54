
-- Allow null operator on access logs (events like qr_open / qr_pin_fail / qr_blocked have no known operator)
ALTER TABLE public.checklist_access_logs ALTER COLUMN operator_id DROP NOT NULL;

-- Replace FK to allow NULL and SET NULL on delete
ALTER TABLE public.checklist_access_logs DROP CONSTRAINT IF EXISTS checklist_access_logs_operator_id_fkey;
ALTER TABLE public.checklist_access_logs
  ADD CONSTRAINT checklist_access_logs_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES public.checklist_operators(id) ON DELETE SET NULL;

-- Add a permissive SELECT policy on checklist_operators for anon/auth that allows PIN validation
-- whenever the tenant has any active checklist (not requiring qr_access_enabled).
-- The pin equality is enforced client-side as a filter; the policy keeps it scoped to active operators
-- inside tenants that actually use checklists.
CREATE POLICY "Public can validate operators for any active checklist"
  ON public.checklist_operators
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.user_id = checklist_operators.user_id
        AND c.is_active = true
    )
  );
