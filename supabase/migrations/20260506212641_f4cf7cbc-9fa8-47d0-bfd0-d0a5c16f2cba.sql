WITH cand AS (
  SELECT DISTINCT ON (dpoi.id)
         dpoi.id AS dpoi_id,
         c.id AS comp_id,
         COALESCE(NULLIF(p.price_delivery, 0), p.price_salon, 0) * COALESCE(c.quantity,1) AS new_price,
         p.name AS new_name,
         dp_link.id AS new_linked
  FROM public.delivery_product_option_items dpoi
  JOIN public.delivery_product_options dpo ON dpo.id = dpoi.option_id
  JOIN public.pdv_product_composition_groups g ON g.id = dpo.source_pdv_option_id
  JOIN public.pdv_product_compositions c ON c.group_id = g.id
  JOIN public.pdv_products p ON p.id = c.child_product_id
  LEFT JOIN public.delivery_products dp_link ON dp_link.source_pdv_product_id = c.child_product_id
  WHERE dpoi.source_pdv_option_item_id IS NULL
    AND lower(trim(dpoi.name)) = lower(trim(p.name))
)
UPDATE public.delivery_product_option_items dpoi
   SET source_pdv_option_item_id = cand.comp_id,
       price_adjustment = cand.new_price,
       name = cand.new_name,
       linked_product_id = COALESCE(dpoi.linked_product_id, cand.new_linked),
       item_kind = COALESCE(dpoi.item_kind, 'product')
  FROM cand
 WHERE dpoi.id = cand.dpoi_id;