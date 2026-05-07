ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS business_settings_slug_lower_idx
  ON public.business_settings (lower(slug))
  WHERE slug IS NOT NULL;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_slug_format_chk;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_slug_format_chk
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');

-- Public resolver: slug -> user_id
CREATE OR REPLACE FUNCTION public.resolve_business_slug(_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.business_settings
  WHERE lower(slug) = lower(_slug)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_business_slug(text) TO anon, authenticated;