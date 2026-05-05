
CREATE OR REPLACE FUNCTION public.delivery_resolve_item_center()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_pdv_id uuid;
  v_slug text;
  v_center uuid;
BEGIN
  IF NEW.production_center_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.user_id INTO v_owner FROM public.delivery_orders o WHERE o.id = NEW.order_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;

  SELECT dp.source_pdv_product_id INTO v_pdv_id
    FROM public.delivery_products dp WHERE dp.id = NEW.product_id;
  IF v_pdv_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.printer_station INTO v_slug
    FROM public.pdv_products p WHERE p.id = v_pdv_id;
  IF v_slug IS NULL OR v_slug = '' THEN RETURN NEW; END IF;

  SELECT pc.id INTO v_center
    FROM public.pdv_production_centers pc
   WHERE pc.user_id = v_owner
     AND pc.is_active = true
     AND pc.slug = v_slug
   LIMIT 1;

  NEW.production_center_id := v_center;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_resolve_item_center ON public.delivery_order_items;
CREATE TRIGGER trg_delivery_resolve_item_center
  BEFORE INSERT ON public.delivery_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.delivery_resolve_item_center();

-- Backfill itens existentes sem centro
UPDATE public.delivery_order_items AS oi
   SET production_center_id = sub.center_id
  FROM (
    SELECT oi2.id AS item_id, pc.id AS center_id
      FROM public.delivery_order_items oi2
      JOIN public.delivery_orders o ON o.id = oi2.order_id
      JOIN public.delivery_products dp ON dp.id = oi2.product_id
      JOIN public.pdv_products p ON p.id = dp.source_pdv_product_id
      JOIN public.pdv_production_centers pc
        ON pc.user_id = o.user_id
       AND pc.is_active = true
       AND pc.slug = p.printer_station
     WHERE oi2.production_center_id IS NULL
       AND p.printer_station IS NOT NULL
       AND p.printer_station <> ''
  ) sub
 WHERE oi.id = sub.item_id;
