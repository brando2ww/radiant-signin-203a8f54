-- Limpa grupos de opções do delivery cuja origem PDV não existe mais
DELETE FROM public.delivery_product_options dpo
WHERE dpo.source_pdv_option_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pdv_product_options o
     WHERE o.id = dpo.source_pdv_option_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.pdv_product_composition_groups g
     WHERE g.id = dpo.source_pdv_option_id
  );

-- Limpa itens órfãos cuja origem PDV não existe mais
DELETE FROM public.delivery_product_option_items dpoi
WHERE dpoi.source_pdv_option_item_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pdv_product_option_items i
     WHERE i.id = dpoi.source_pdv_option_item_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.pdv_product_compositions c
     WHERE c.id = dpoi.source_pdv_option_item_id
  );