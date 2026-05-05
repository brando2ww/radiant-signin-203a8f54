
ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS cashier_session_id uuid REFERENCES public.pdv_cashier_sessions(id),
  ADD COLUMN IF NOT EXISTS ticket_number int;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pdv_orders_session_ticket
  ON public.pdv_orders(cashier_session_id, ticket_number)
  WHERE cashier_session_id IS NOT NULL AND ticket_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pdv_assign_order_ticket(p_order_id uuid)
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
  FROM public.pdv_orders
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
  FROM public.pdv_orders
  WHERE cashier_session_id = v_session;

  UPDATE public.pdv_orders
     SET cashier_session_id = v_session,
         ticket_number = v_next
   WHERE id = p_order_id;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pdv_assign_order_ticket(uuid) TO anon, authenticated;

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
  o.ticket_number,
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
