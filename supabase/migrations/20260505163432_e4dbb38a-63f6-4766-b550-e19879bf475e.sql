
-- 1. Coluna is_virtual em pdv_tables
ALTER TABLE public.pdv_tables ADD COLUMN IF NOT EXISTS is_virtual boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pdv_tables_is_virtual ON public.pdv_tables(user_id, is_virtual);

-- 2. counter_table_name em pdv_settings
ALTER TABLE public.pdv_settings ADD COLUMN IF NOT EXISTS counter_table_name text NOT NULL DEFAULT 'Balcão';

-- 3. Função que garante a mesa virtual do owner
CREATE OR REPLACE FUNCTION public.pdv_ensure_counter_table(_owner uuid, _name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_clean text := COALESCE(NULLIF(trim(_name), ''), 'Balcão');
BEGIN
  SELECT id INTO v_id FROM public.pdv_tables
   WHERE user_id = _owner AND is_virtual = true
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.pdv_tables (user_id, table_number, capacity, status, is_virtual)
    VALUES (_owner, v_clean, 0, 'livre', true)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.pdv_tables SET table_number = v_clean, updated_at = now()
     WHERE id = v_id AND table_number IS DISTINCT FROM v_clean;
  END IF;

  RETURN v_id;
END;
$$;

-- 4. Trigger em pdv_settings para garantir/renomear mesa virtual
CREATE OR REPLACE FUNCTION public.pdv_settings_ensure_counter_table()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.pdv_ensure_counter_table(NEW.user_id, NEW.counter_table_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pdv_settings_ensure_counter_table ON public.pdv_settings;
CREATE TRIGGER trg_pdv_settings_ensure_counter_table
AFTER INSERT OR UPDATE OF counter_table_name ON public.pdv_settings
FOR EACH ROW EXECUTE FUNCTION public.pdv_settings_ensure_counter_table();

-- 5. Backfill: garantir mesa virtual para todos os settings existentes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT user_id, counter_table_name FROM public.pdv_settings LOOP
    PERFORM public.pdv_ensure_counter_table(r.user_id, r.counter_table_name);
  END LOOP;
END$$;

-- 6. Atualizar a view de impressão de comandas
DROP VIEW IF EXISTS public.vw_print_bridge_comanda_items;
CREATE VIEW public.vw_print_bridge_comanda_items AS
SELECT 
  ci.id,
  ci.comanda_id,
  ci.production_center_id,
  ci.product_name,
  ci.quantity,
  ci.notes,
  ci.modifiers,
  ci.kitchen_status,
  ci.sent_to_kitchen_at,
  ci.parent_item_id,
  ci.is_composite_child,
  parent.product_name AS parent_product_name,
  pc.name AS center_name,
  pc.printer_ip,
  pc.printer_port,
  c.comanda_number,
  c.customer_name,
  c.user_id AS tenant_user_id,
  o.id AS order_id,
  o.order_number,
  o.table_id,
  t.table_number,
  COALESCE(t.is_virtual, false) AS is_virtual
FROM public.pdv_comanda_items ci
JOIN public.pdv_comandas c ON c.id = ci.comanda_id
LEFT JOIN public.pdv_orders o ON o.id = c.order_id
LEFT JOIN public.pdv_tables t ON t.id = o.table_id
LEFT JOIN public.pdv_production_centers pc ON pc.id = ci.production_center_id
LEFT JOIN public.pdv_comanda_items parent ON parent.id = ci.parent_item_id;

GRANT SELECT ON public.vw_print_bridge_comanda_items TO anon, authenticated;
