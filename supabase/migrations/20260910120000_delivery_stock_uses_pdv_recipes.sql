-- Baixa de estoque do delivery: usa a ficha técnica do PDV quando o delivery
-- não tem a sua.
--
-- Motivo: em produção `delivery_product_recipes` e `delivery_option_item_recipes`
-- estão ZERADAS, enquanto o PDV tem 59 fichas de produto e 8 de adicional.
-- A função existia e nunca consumiu nada — 3 movimentos de saída em toda a
-- história do banco, todos vindos de comanda. Ficha é uma só; o delivery
-- alcança a do PDV por delivery_products.source_pdv_product_id e por
-- delivery_product_option_items.source_pdv_option_item_id.
--
-- Corrige também um erro antigo: a quantidade do ADICIONAL era ignorada.
-- "2x molho" consumia 1x, porque a conta multiplicava só pela quantidade do
-- item. Agora multiplica pelas duas.
CREATE OR REPLACE FUNCTION public.consume_ingredients_for_delivery_order(p_order_id uuid)
 RETURNS TABLE(out_ingredient_id uuid, out_total_consumed numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  SELECT user_id INTO v_owner FROM public.delivery_orders WHERE id = p_order_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_delivery_consumption (
    order_item_id uuid,
    ingredient_id uuid,
    qty_consumed numeric
  ) ON COMMIT DROP;
  TRUNCATE tmp_delivery_consumption;

  WITH src_items AS (
    SELECT oi.id AS order_item_id,
           oi.product_id,
           oi.quantity::numeric AS qty
    FROM public.delivery_order_items oi
    WHERE oi.order_id = p_order_id
  ),
  -- Ficha própria do delivery, quando existir.
  main_recipe AS (
    SELECT s.order_item_id, pr.ingredient_id, (pr.quantity::numeric * s.qty) AS qty_consumed
    FROM src_items s
    JOIN public.delivery_product_recipes pr ON pr.product_id = s.product_id
  ),
  -- Senão, a ficha do PDV pelo produto de origem.
  main_recipe_pdv AS (
    SELECT s.order_item_id, ppr.ingredient_id, (ppr.quantity::numeric * s.qty) AS qty_consumed
    FROM src_items s
    JOIN public.delivery_products dp ON dp.id = s.product_id
    JOIN public.pdv_product_recipes ppr ON ppr.product_id = dp.source_pdv_product_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.delivery_product_recipes pr WHERE pr.product_id = s.product_id
    )
  ),
  option_recipe AS (
    SELECT s.order_item_id, oir.ingredient_id,
           (oir.quantity::numeric * s.qty * COALESCE(oio.quantity, 1)::numeric) AS qty_consumed
    FROM src_items s
    JOIN public.delivery_order_item_options oio ON oio.order_item_id = s.order_item_id
    JOIN public.delivery_option_item_recipes oir ON oir.option_item_id = oio.option_item_id
    WHERE oio.option_item_id IS NOT NULL
  ),
  option_recipe_pdv AS (
    SELECT s.order_item_id, poir.ingredient_id,
           (poir.quantity::numeric * s.qty * COALESCE(oio.quantity, 1)::numeric) AS qty_consumed
    FROM src_items s
    JOIN public.delivery_order_item_options oio ON oio.order_item_id = s.order_item_id
    JOIN public.delivery_product_option_items dpoi ON dpoi.id = oio.option_item_id
    JOIN public.pdv_option_item_recipes poir ON poir.option_item_id = dpoi.source_pdv_option_item_id
    WHERE oio.option_item_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_option_item_recipes oir
        WHERE oir.option_item_id = oio.option_item_id
      )
  ),
  unioned AS (
    SELECT * FROM main_recipe
    UNION ALL SELECT * FROM main_recipe_pdv
    UNION ALL SELECT * FROM option_recipe
    UNION ALL SELECT * FROM option_recipe_pdv
  )
  INSERT INTO tmp_delivery_consumption (order_item_id, ingredient_id, qty_consumed)
  SELECT u.order_item_id, u.ingredient_id, SUM(u.qty_consumed)
  FROM unioned u
  GROUP BY u.order_item_id, u.ingredient_id
  HAVING SUM(u.qty_consumed) > 0;

  -- Idempotência: descarta o que já foi registrado (mesmo item + ingrediente).
  DELETE FROM tmp_delivery_consumption tc
  USING public.pdv_stock_movements sm
  WHERE sm.order_item_id = tc.order_item_id
    AND sm.ingredient_id = tc.ingredient_id;

  IF NOT EXISTS (SELECT 1 FROM tmp_delivery_consumption) THEN
    RETURN;
  END IF;

  UPDATE public.pdv_ingredients ing
  SET current_stock = COALESCE(ing.current_stock, 0) - agg.qty_consumed
  FROM (
    SELECT tc.ingredient_id, SUM(tc.qty_consumed) AS qty_consumed
    FROM tmp_delivery_consumption tc
    GROUP BY tc.ingredient_id
  ) agg
  WHERE ing.id = agg.ingredient_id;

  INSERT INTO public.pdv_stock_movements (ingredient_id, type, quantity, reason, created_by, order_item_id)
  SELECT tc.ingredient_id, 'saida_venda'::pdv_stock_movement_type, tc.qty_consumed,
         'Venda via delivery', v_owner, tc.order_item_id
  FROM tmp_delivery_consumption tc;

  RETURN QUERY
  SELECT tc.ingredient_id, SUM(tc.qty_consumed)::numeric
  FROM tmp_delivery_consumption tc
  GROUP BY tc.ingredient_id;
END;
$function$;
