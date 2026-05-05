ALTER TABLE public.delivery_settings
ADD COLUMN IF NOT EXISTS cep_ranges jsonb NOT NULL DEFAULT '[]'::jsonb;