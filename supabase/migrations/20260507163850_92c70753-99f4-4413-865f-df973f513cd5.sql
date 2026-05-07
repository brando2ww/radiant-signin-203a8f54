
CREATE OR REPLACE FUNCTION public.auto_accept_delivery_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto boolean;
  v_session uuid;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT auto_accept_orders INTO v_auto
    FROM public.delivery_settings
   WHERE user_id = NEW.user_id
   LIMIT 1;

  IF NOT COALESCE(v_auto, false) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_session
    FROM public.pdv_cashier_sessions
   WHERE user_id = NEW.user_id
     AND closed_at IS NULL
   ORDER BY opened_at DESC
   LIMIT 1;

  IF v_session IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.status := 'preparing';
  NEW.confirmed_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_accept_delivery_order ON public.delivery_orders;
CREATE TRIGGER trg_auto_accept_delivery_order
BEFORE INSERT ON public.delivery_orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_accept_delivery_order();

CREATE OR REPLACE FUNCTION public.auto_consume_delivery_ingredients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'preparing'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'preparing') THEN
    BEGIN
      PERFORM public.consume_ingredients_for_delivery_order(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- best-effort
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_consume_delivery_ingredients ON public.delivery_orders;
CREATE TRIGGER trg_auto_consume_delivery_ingredients
AFTER INSERT OR UPDATE OF status ON public.delivery_orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_consume_delivery_ingredients();
