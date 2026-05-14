-- Remove possíveis duplicatas mantendo a mais recente
DELETE FROM public.checklist_evidence_reviews a
USING public.checklist_evidence_reviews b
WHERE a.execution_item_id = b.execution_item_id
  AND a.created_at < b.created_at;

ALTER TABLE public.checklist_evidence_reviews
  ADD CONSTRAINT checklist_evidence_reviews_execution_item_id_key
  UNIQUE (execution_item_id);

ALTER TABLE public.checklist_evidence_reviews
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_checklist_evidence_reviews_updated_at ON public.checklist_evidence_reviews;
CREATE TRIGGER trg_checklist_evidence_reviews_updated_at
BEFORE UPDATE ON public.checklist_evidence_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();