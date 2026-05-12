ALTER TABLE public.evaluation_campaign_questions
  ADD COLUMN IF NOT EXISTS placeholder text,
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_length integer NOT NULL DEFAULT 500;

ALTER TABLE public.evaluation_answers
  ADD COLUMN IF NOT EXISTS text_answer text;