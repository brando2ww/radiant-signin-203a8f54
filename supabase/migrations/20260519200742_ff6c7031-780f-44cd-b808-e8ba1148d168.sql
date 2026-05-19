ALTER TABLE public.evaluation_campaigns
ADD COLUMN IF NOT EXISTS google_redirect_mode text NOT NULL DEFAULT 'promoters'
CHECK (google_redirect_mode IN ('off','promoters','always'));