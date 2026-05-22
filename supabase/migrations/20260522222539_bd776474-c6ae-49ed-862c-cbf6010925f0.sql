-- Adicionar campos de rótulo de grupo e posição para ordenação na impressão
ALTER TABLE public.pdv_comanda_items
  ADD COLUMN IF NOT EXISTS composition_group_label TEXT,
  ADD COLUMN IF NOT EXISTS composition_position INTEGER;

ALTER TABLE public.pdv_order_items
  ADD COLUMN IF NOT EXISTS composition_group_label TEXT,
  ADD COLUMN IF NOT EXISTS composition_position INTEGER;

-- Recriar view de impressão de comandas expondo os novos campos
DROP VIEW IF EXISTS public.vw_print_bridge_comanda_items;
CREATE VIEW public.vw_print_bridge_comanda_items
WITH (security_invoker = true)
AS
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
  ci.composition_group_label,
  ci.composition_position,
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

-- Recriar view de impressão de pedidos (PDV) preservando colunas existentes + novos campos
DROP VIEW IF EXISTS public.vw_print_bridge_order_items;
CREATE VIEW public.vw_print_bridge_order_items
WITH (security_invoker = true)
AS
SELECT
  oi.id,
  oi.order_id,
  oi.production_center_id,
  oi.product_name,
  oi.quantity,
  oi.notes,
  oi.modifiers,
  oi.kitchen_status,
  oi.sent_to_kitchen_at,
  oi.parent_item_id,
  oi.is_composite_child,
  oi.composition_group_label,
  oi.composition_position,
  parent.product_name AS parent_product_name,
  pc.name AS center_name,
  pc.printer_ip,
  pc.printer_port,
  o.order_number,
  o.user_id AS tenant_user_id,
  o.table_id,
  t.table_number,
  COALESCE(t.is_virtual, false) AS is_virtual
FROM public.pdv_order_items oi
JOIN public.pdv_orders o ON o.id = oi.order_id
LEFT JOIN public.pdv_tables t ON t.id = o.table_id
LEFT JOIN public.pdv_production_centers pc ON pc.id = oi.production_center_id
LEFT JOIN public.pdv_order_items parent ON parent.id = oi.parent_item_id;

GRANT SELECT ON public.vw_print_bridge_order_items TO anon, authenticated;