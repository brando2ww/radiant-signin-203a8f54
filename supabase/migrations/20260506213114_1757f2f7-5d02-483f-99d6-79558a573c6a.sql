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
  o.user_id AS tenant_user_id,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', oio.item_name,
        'option_name', oio.option_name,
        'quantity', oio.quantity
      ) ORDER BY oio.option_name, oio.item_name
    )
    FROM public.delivery_order_item_options oio
    WHERE oio.order_item_id = oi.id
  ), '[]'::jsonb) AS options
FROM public.delivery_order_items oi
JOIN public.delivery_orders o ON o.id = oi.order_id
LEFT JOIN public.pdv_production_centers pc ON pc.id = oi.production_center_id;

GRANT SELECT ON public.vw_print_bridge_delivery_items TO anon, authenticated;