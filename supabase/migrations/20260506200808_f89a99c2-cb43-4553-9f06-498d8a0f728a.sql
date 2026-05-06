ALTER TABLE public.pdv_product_composition_groups
ADD COLUMN IF NOT EXISTS allow_quantity boolean NOT NULL DEFAULT false;