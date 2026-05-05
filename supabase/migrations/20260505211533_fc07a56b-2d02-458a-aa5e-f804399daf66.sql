-- Estende a RPC para também clonar grupos de composição como opções no delivery
CREATE OR REPLACE FUNCTION public.delivery_clone_options_from_pdv(p_pdv_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dp RECORD;
  v_opt RECORD;
  v_new_opt_id uuid;
  v_item RECORD;
  v_linked uuid;
  v_count int := 0;
  v_grp RECORD;
  v_comp RECORD;
  v_child_name text;
BEGIN
  FOR v_dp IN
    SELECT id, user_id FROM public.delivery_products
     WHERE source_pdv_product_id = p_pdv_product_id
  LOOP
    -- 1) Opções tradicionais (pdv_product_options)
    FOR v_opt IN
      SELECT * FROM public.pdv_product_options
       WHERE product_id = p_pdv_product_id
       ORDER BY order_position
    LOOP
      SELECT id INTO v_new_opt_id
        FROM public.delivery_product_options
       WHERE source_pdv_option_id = v_opt.id
       LIMIT 1;

      IF v_new_opt_id IS NULL THEN
        INSERT INTO public.delivery_product_options
          (product_id, name, type, is_required, min_selections, max_selections,
           order_position, source_pdv_option_id)
        VALUES
          (v_dp.id, v_opt.name, v_opt.type, v_opt.is_required,
           v_opt.min_selections, v_opt.max_selections, v_opt.order_position, v_opt.id)
        RETURNING id INTO v_new_opt_id;
      END IF;

      FOR v_item IN
        SELECT * FROM public.pdv_product_option_items
         WHERE option_id = v_opt.id
         ORDER BY order_position
      LOOP
        v_linked := NULL;
        IF v_item.linked_product_id IS NOT NULL THEN
          SELECT dp2.id INTO v_linked
            FROM public.delivery_products dp2
           WHERE dp2.source_pdv_product_id = v_item.linked_product_id
           LIMIT 1;
        END IF;

        INSERT INTO public.delivery_product_option_items
          (option_id, name, price_adjustment, is_available, order_position,
           source_pdv_option_item_id, item_kind, linked_product_id)
        VALUES
          (v_new_opt_id, v_item.name, v_item.price_adjustment, v_item.is_available,
           v_item.order_position, v_item.id, v_item.item_kind, v_linked)
        ON CONFLICT DO NOTHING;
        v_count := v_count + 1;
      END LOOP;
    END LOOP;

    -- 2) Grupos de composição (Kits/Combos) — exibidos como opções no delivery
    FOR v_grp IN
      SELECT * FROM public.pdv_product_composition_groups
       WHERE parent_product_id = p_pdv_product_id
       ORDER BY order_position
    LOOP
      SELECT id INTO v_new_opt_id
        FROM public.delivery_product_options
       WHERE source_pdv_option_id = v_grp.id
       LIMIT 1;

      IF v_new_opt_id IS NULL THEN
        INSERT INTO public.delivery_product_options
          (product_id, name, type, is_required, min_selections, max_selections,
           order_position, source_pdv_option_id)
        VALUES
          (v_dp.id, v_grp.name, v_grp.type, v_grp.is_required,
           v_grp.min_selections, v_grp.max_selections,
           1000 + v_grp.order_position, v_grp.id)
        RETURNING id INTO v_new_opt_id;
      ELSE
        UPDATE public.delivery_product_options
           SET product_id = v_dp.id,
               name = v_grp.name,
               type = v_grp.type,
               is_required = v_grp.is_required,
               min_selections = v_grp.min_selections,
               max_selections = v_grp.max_selections,
               updated_at = now()
         WHERE id = v_new_opt_id;
      END IF;

      FOR v_comp IN
        SELECT c.*, p.name AS child_name
          FROM public.pdv_product_compositions c
          LEFT JOIN public.pdv_products p ON p.id = c.child_product_id
         WHERE c.group_id = v_grp.id
         ORDER BY c.order_position
      LOOP
        v_linked := NULL;
        IF v_comp.child_product_id IS NOT NULL THEN
          SELECT dp2.id INTO v_linked
            FROM public.delivery_products dp2
           WHERE dp2.source_pdv_product_id = v_comp.child_product_id
           LIMIT 1;
        END IF;

        v_child_name := COALESCE(v_comp.child_name, 'Item');

        INSERT INTO public.delivery_product_option_items
          (option_id, name, price_adjustment, is_available, order_position,
           source_pdv_option_item_id, item_kind, linked_product_id)
        VALUES
          (v_new_opt_id, v_child_name, 0, true,
           v_comp.order_position, v_comp.id, 'product', v_linked)
        ON CONFLICT DO NOTHING;
        v_count := v_count + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'items_seeded', v_count);
END;
$function$;

-- Triggers de sincronização para grupos de composição → delivery_product_options
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
    DELETE FROM public.delivery_product_options
     WHERE source_pdv_option_id = OLD.id;
    RETURN OLD;
  END IF;

  FOR v_dp IN
    SELECT id FROM public.delivery_products
     WHERE source_pdv_product_id = NEW.parent_product_id
       AND COALESCE(sync_enabled, true) = true
  LOOP
    SELECT id INTO v_target_id
      FROM public.delivery_product_options
     WHERE source_pdv_option_id = NEW.id
     LIMIT 1;

    IF v_target_id IS NULL THEN
      INSERT INTO public.delivery_product_options
        (product_id, name, type, is_required, min_selections, max_selections,
         order_position, source_pdv_option_id)
      VALUES
        (v_dp.id, NEW.name, NEW.type, NEW.is_required,
         NEW.min_selections, NEW.max_selections,
         1000 + NEW.order_position, NEW.id);
    ELSE
      UPDATE public.delivery_product_options
         SET product_id = v_dp.id,
             name = NEW.name,
             type = NEW.type,
             is_required = NEW.is_required,
             min_selections = NEW.min_selections,
             max_selections = NEW.max_selections,
             updated_at = now()
       WHERE id = v_target_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_pdv_composition_group_to_delivery
  ON public.pdv_product_composition_groups;
CREATE TRIGGER trg_sync_pdv_composition_group_to_delivery
AFTER INSERT OR UPDATE OR DELETE ON public.pdv_product_composition_groups
FOR EACH ROW EXECUTE FUNCTION public.sync_pdv_composition_group_to_delivery();

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
  v_grp_id uuid;
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

  SELECT name INTO v_child_name FROM public.pdv_products WHERE id = NEW.child_product_id;
  v_child_name := COALESCE(v_child_name, 'Item');

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
        (v_target_option_id, v_child_name, 0, true,
         NEW.order_position, NEW.id, 'product', v_linked);
    ELSE
      UPDATE public.delivery_product_option_items
         SET name = v_child_name,
             order_position = NEW.order_position,
             linked_product_id = v_linked
       WHERE id = v_target_item_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_pdv_composition_to_delivery
  ON public.pdv_product_compositions;
CREATE TRIGGER trg_sync_pdv_composition_to_delivery
AFTER INSERT OR UPDATE OR DELETE ON public.pdv_product_compositions
FOR EACH ROW EXECUTE FUNCTION public.sync_pdv_composition_to_delivery();