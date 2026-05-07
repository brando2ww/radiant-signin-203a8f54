-- Backfill order_position por grupo, ordenando por created_at
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY group_id ORDER BY created_at, id) - 1 AS rn
    FROM public.pdv_product_compositions
   WHERE group_id IS NOT NULL
)
UPDATE public.pdv_product_compositions c
   SET order_position = r.rn
  FROM ranked r
 WHERE c.id = r.id
   AND c.order_position IS DISTINCT FROM r.rn;