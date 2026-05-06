DELETE FROM public.pdv_product_options o
WHERE EXISTS (
  SELECT 1 FROM public.pdv_product_composition_groups g
  WHERE g.parent_product_id = o.product_id
);