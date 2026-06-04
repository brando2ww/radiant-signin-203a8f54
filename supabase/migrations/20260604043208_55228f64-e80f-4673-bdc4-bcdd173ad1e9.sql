
CREATE TABLE public.operator_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  operator_id uuid NOT NULL REFERENCES public.checklist_operators(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Award',
  awarded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, code)
);

CREATE INDEX idx_operator_achievements_operator ON public.operator_achievements(operator_id);
CREATE INDEX idx_operator_achievements_user ON public.operator_achievements(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_achievements TO authenticated;
GRANT ALL ON public.operator_achievements TO service_role;

ALTER TABLE public.operator_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and members can view achievements"
  ON public.operator_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

CREATE POLICY "Owners and members can insert achievements"
  ON public.operator_achievements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_establishment_member(user_id));

CREATE POLICY "Owners and members can update achievements"
  ON public.operator_achievements FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

CREATE POLICY "Owners and members can delete achievements"
  ON public.operator_achievements FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_establishment_member(user_id));
