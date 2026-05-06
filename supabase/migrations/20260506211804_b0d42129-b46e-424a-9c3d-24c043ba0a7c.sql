
CREATE OR REPLACE FUNCTION public.sync_pdv_product_price_to_composition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price numeric;
BEGIN
  v_price := COALESCE(NULLIF(NEW.price_delivery, 0), NEW.price_salon, 0);

  UPDATE public.delivery_product_option_items dpoi
     SET name = NEW.name,
         price_adjustment = v_price * COALESCE(c.quantity, 1)
    FROM public.pdv_product_compositions c
   WHERE dpoi.source_pdv_option_item_id = c.id
     AND c.child_product_id = NEW.id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_pdv_composition_to_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_option_id uuid;
  v_target_item_id uuid;
  v_linked uuid;
  v_child_name text;
  v_child_price numeric;
  v_grp_id uuid;
  v_price_adj numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.delivery_product_option_items
     WHERE source_pdv_option_item_id = OLD.id;
    RETURN OLD;
  END IF;

  v_grp_id := NEW.group_id;
  IF v_grp_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name, COALESCE(NULLIF(price_delivery, 0), price_salon, 0)
    INTO v_child_name, v_child_price
    FROM public.pdv_products WHERE id = NEW.child_product_id;
  v_child_name := COALESCE(v_child_name, 'Item');
  v_price_adj := COALESCE(v_child_price, 0) * COALESCE(NEW.quantity, 1);

  v_linked := NULL;
  IF NEW.child_product_id IS NOT NULL THEN
    SELECT dp.id INTO v_linked
      FROM public.delivery_products dp
     WHERE dp.source_pdv_product_id = NEW.child_product_id
     LIMIT 1;
  END IF;

  FOR v_target_option_id IN
    SELECT id FROM public.delivery_product_options
     WHERE source_pdv_option_id = v_grp_id
  LOOP
    SELECT id INTO v_target_item_id
      FROM public.delivery_product_option_items
     WHERE source_pdv_option_item_id = NEW.id
       AND option_id = v_target_option_id
     LIMIT 1;

    IF v_target_item_id IS NULL THEN
      INSERT INTO public.delivery_product_option_items
        (option_id, name, price_adjustment, is_available, order_position,
         source_pdv_option_item_id, item_kind, linked_product_id)
      VALUES
        (v_target_option_id, v_child_name, v_price_adj, true,
         NEW.order_position, NEW.id, 'product', v_linked);
    ELSE
      UPDATE public.delivery_product_option_items
         SET name = v_child_name,
             price_adjustment = v_price_adj,
             order_position = NEW.order_position,
             linked_product_id = v_linked
       WHERE id = v_target_item_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Backfill: corrigir os preços já gravados
UPDATE public.delivery_product_option_items dpoi
   SET price_adjustment = COALESCE(NULLIF(p.price_delivery, 0), p.price_salon, 0) * COALESCE(c.quantity, 1),
       name = COALESCE(p.name, dpoi.name)
  FROM public.pdv_product_compositions c
  JOIN public.pdv_products p ON p.id = c.child_product_id
 WHERE dpoi.source_pdv_option_item_id = c.id;
