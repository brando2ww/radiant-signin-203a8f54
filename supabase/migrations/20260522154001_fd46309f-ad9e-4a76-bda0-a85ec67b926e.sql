ALTER TABLE public.campaign_prizes
  ADD COLUMN IF NOT EXISTS reward_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS reward_value numeric,
  ADD COLUMN IF NOT EXISTS reward_product_id uuid REFERENCES public.pdv_products(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_prizes_reward_type_check'
  ) THEN
    ALTER TABLE public.campaign_prizes
      ADD CONSTRAINT campaign_prizes_reward_type_check
      CHECK (reward_type IN ('percent','fixed','free_product','manual'));
  END IF;
END $$;