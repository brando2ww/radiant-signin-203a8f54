
-- 1) sync allow_quantity from PDV composition group -> delivery option
CREATE OR REPLACE FUNCTION public.sync_pdv_composition_group_to_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dp RECORD;
  v_target_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.delivery_product_options WHERE source_pdv_option_id = OLD.id;
    RETURN OLD;
  END IF;

  FOR v_dp IN
    SELECT id FROM public.delivery_products
     WHERE source_pdv_product_id = NEW.parent_product_id
       AND COALESCE(sync_enabled, true) = true
  LOOP
    SELECT id INTO v_target_id FROM public.delivery_product_options
     WHERE source_pdv_option_id = NEW.id LIMIT 1;

    IF v_target_id IS NULL THEN
      INSERT INTO public.delivery_product_options
        (product_id, name, type, is_required, min_selections, max_selections,
         order_position, source_pdv_option_id, allow_quantity)
      VALUES
        (v_dp.id, NEW.name, NEW.type, NEW.is_required,
         NEW.min_selections, NEW.max_selections,
         1000 + NEW.order_position, NEW.id, COALESCE(NEW.allow_quantity, false));
    ELSE
      UPDATE public.delivery_product_options
         SET product_id = v_dp.id,
             name = NEW.name,
             type = NEW.type,
             is_required = NEW.is_required,
             min_selections = NEW.min_selections,
             max_selections = NEW.max_selections,
             allow_quantity = COALESCE(NEW.allow_quantity, false),
             updated_at = now()
       WHERE id = v_target_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 2) sync allow_quantity from PDV regular options -> delivery
CREATE OR REPLACE FUNCTION public.sync_pdv_option_to_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dp RECORD;
  v_target_id uuid;
  v_payload RECORD;
  v_allow boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.delivery_product_options WHERE source_pdv_option_id = OLD.id;
    RETURN OLD;
  END IF;

  v_payload := NEW;
  -- pdv_product_options may or may not have allow_quantity; pull defensively
  BEGIN
    EXECUTE 'SELECT allow_quantity FROM public.pdv_product_options WHERE id = $1'
      INTO v_allow USING v_payload.id;
  EXCEPTION WHEN undefined_column THEN
    v_allow := false;
  END;
  v_allow := COALESCE(v_allow, false);

  FOR v_dp IN
    SELECT id, user_id FROM public.delivery_products
     WHERE source_pdv_product_id = v_payload.product_id
       AND COALESCE(sync_enabled, true) = true
  LOOP
    SELECT id INTO v_target_id FROM public.delivery_product_options
     WHERE source_pdv_option_id = v_payload.id LIMIT 1;

    IF v_target_id IS NULL THEN
      INSERT INTO public.delivery_product_options
        (product_id, name, type, is_required, min_selections, max_selections,
         order_position, source_pdv_option_id, allow_quantity)
      VALUES
        (v_dp.id, v_payload.name, v_payload.type, v_payload.is_required,
         v_payload.min_selections, v_payload.max_selections,
         v_payload.order_position, v_payload.id, v_allow);
    ELSE
      UPDATE public.delivery_product_options
         SET product_id = v_dp.id,
             name = v_payload.name,
             type = v_payload.type,
             is_required = v_payload.is_required,
             min_selections = v_payload.min_selections,
             max_selections = v_payload.max_selections,
             allow_quantity = v_allow,
             order_position = v_payload.order_position,
             updated_at = now()
       WHERE id = v_target_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 3) Recalc delivery price_adjustment when PDV product price changes
CREATE OR REPLACE FUNCTION public.sync_pdv_product_price_to_composition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price numeric;
BEGIN
  v_price := COALESCE(NEW.price_delivery, NEW.price_salon, 0);

  UPDATE public.delivery_product_option_items dpoi
     SET name = NEW.name,
         price_adjustment = v_price * COALESCE(c.quantity, 1)
    FROM public.pdv_product_compositions c
   WHERE dpoi.source_pdv_option_item_id = c.id
     AND c.child_product_id = NEW.id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_pdv_product_price_to_composition ON public.pdv_products;
CREATE TRIGGER trg_sync_pdv_product_price_to_composition
AFTER UPDATE OF price_delivery, price_salon, name ON public.pdv_products
FOR EACH ROW EXECUTE FUNCTION public.sync_pdv_product_price_to_composition();

-- 4) Backfill allow_quantity from composition groups
UPDATE public.delivery_product_options dpo
   SET allow_quantity = COALESCE(g.allow_quantity, false)
  FROM public.pdv_product_composition_groups g
 WHERE dpo.source_pdv_option_id = g.id
   AND COALESCE(dpo.allow_quantity, false) IS DISTINCT FROM COALESCE(g.allow_quantity, false);

-- 5) Backfill allow_quantity from regular options (defensive)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pdv_product_options' AND column_name='allow_quantity'
  ) THEN
    EXECUTE $sql$
      UPDATE public.delivery_product_options dpo
         SET allow_quantity = COALESCE(o.allow_quantity, false)
        FROM public.pdv_product_options o
       WHERE dpo.source_pdv_option_id = o.id
         AND COALESCE(dpo.allow_quantity, false) IS DISTINCT FROM COALESCE(o.allow_quantity, false)
    $sql$;
  END IF;
END $$;

-- 6) Backfill price_adjustment for existing composition items based on current child product price
UPDATE public.delivery_product_option_items dpoi
   SET price_adjustment = COALESCE(p.price_delivery, p.price_salon, 0) * COALESCE(c.quantity, 1),
       name = COALESCE(p.name, dpoi.name)
  FROM public.pdv_product_compositions c
  LEFT JOIN public.pdv_products p ON p.id = c.child_product_id
 WHERE dpoi.source_pdv_option_item_id = c.id;
