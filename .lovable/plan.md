# Vincular itens órfãos do Sushi Mix 22 Peças

## Diagnóstico
Os itens "04 Hot Holl Banana com Nutella" e "04 Hot Holl Morango com Nutella" do grupo "Doces" no delivery estão com `source_pdv_option_item_id = NULL` (órfãos). Por isso nem o trigger de sincronização nem o backfill anterior conseguiram corrigir o `price_adjustment`.

O "08 Hot Doce" funciona porque foi recriado com vínculo correto.

## Migração de dados

Vincular cada item órfão à composição PDV correspondente do mesmo grupo, casando pelo nome do filho, e recalcular o preço a partir do produto-pai (`price_delivery` com fallback para `price_salon`):

```sql
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
```

Cobre o Sushi Mix 22 Peças e qualquer outro produto-composto na mesma situação. Após isso, futuras alterações de preço propagam normalmente via trigger.
