
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS ticket_number int;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_orders_session_ticket
  ON public.delivery_orders(cashier_session_id, ticket_number)
  WHERE cashier_session_id IS NOT NULL AND ticket_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.delivery_assign_order_ticket(p_order_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_existing int;
  v_session uuid;
  v_next int;
BEGIN
  SELECT user_id, ticket_number, cashier_session_id
    INTO v_owner, v_existing, v_session
  FROM public.delivery_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_existing IS NOT NULL AND v_session IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT id INTO v_session
  FROM public.pdv_cashier_sessions
  WHERE user_id = v_owner AND closed_at IS NULL
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_session IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(ticket_number), 0) + 1 INTO v_next
  FROM public.delivery_orders
  WHERE cashier_session_id = v_session;

  UPDATE public.delivery_orders
     SET cashier_session_id = v_session,
         ticket_number = v_next,
         order_number = lpad(v_next::text, 3, '0')
   WHERE id = p_order_id;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delivery_assign_order_ticket(uuid) TO anon, authenticated;

DROP VIEW IF EXISTS public.vw_print_bridge_delivery_items;
CREATE VIEW public.vw_print_bridge_delivery_items AS
SELECT
  oi.id,
  oi.order_id,
  oi.production_center_id,
  oi.product_name,
  oi.quantity,
  oi.notes,
  pc.name AS center_name,
  pc.printer_ip,
  pc.printer_port,
  o.order_number,
  o.ticket_number,
  o.customer_name,
  o.customer_phone,
  o.order_type,
  o.delivery_address_text,
  o.user_id AS tenant_user_id
FROM public.delivery_order_items oi
JOIN public.delivery_orders o ON o.id = oi.order_id
LEFT JOIN public.pdv_production_centers pc ON pc.id = oi.production_center_id;

GRANT SELECT ON public.vw_print_bridge_delivery_items TO anon, authenticated;
