
CREATE TABLE public.pdv_product_composition_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_product_id UUID NOT NULL REFERENCES public.pdv_products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'single',
  is_required BOOLEAN NOT NULL DEFAULT false,
  min_selections INTEGER NOT NULL DEFAULT 0,
  max_selections INTEGER NOT NULL DEFAULT 1,
  order_position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdv_composition_groups_parent ON public.pdv_product_composition_groups(parent_product_id);

ALTER TABLE public.pdv_product_composition_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own composition groups"
ON public.pdv_product_composition_groups
FOR ALL
USING (
  parent_product_id IN (
    SELECT id FROM public.pdv_products WHERE user_id = auth.uid()
  )
  OR parent_product_id IN (
    SELECT id FROM public.pdv_products
    WHERE user_id IN (
      SELECT establishment_owner_id FROM public.establishment_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
)
WITH CHECK (
  parent_product_id IN (
    SELECT id FROM public.pdv_products WHERE user_id = auth.uid()
  )
  OR parent_product_id IN (
    SELECT id FROM public.pdv_products
    WHERE user_id IN (
      SELECT establishment_owner_id FROM public.establishment_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
);

ALTER TABLE public.pdv_product_compositions
ADD COLUMN group_id UUID REFERENCES public.pdv_product_composition_groups(id) ON DELETE CASCADE;

CREATE INDEX idx_pdv_compositions_group ON public.pdv_product_compositions(group_id);

-- Backfill: create one default group per composite product and link existing compositions
DO $$
DECLARE
  r RECORD;
  v_group_id UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT parent_product_id
    FROM public.pdv_product_compositions
    WHERE group_id IS NULL
  LOOP
    INSERT INTO public.pdv_product_composition_groups
      (parent_product_id, name, type, is_required, min_selections, max_selections, order_position)
    VALUES (r.parent_product_id, 'Composição', 'single', false, 0, 1, 0)
    RETURNING id INTO v_group_id;

    UPDATE public.pdv_product_compositions
    SET group_id = v_group_id
    WHERE parent_product_id = r.parent_product_id AND group_id IS NULL;
  END LOOP;
END $$;
