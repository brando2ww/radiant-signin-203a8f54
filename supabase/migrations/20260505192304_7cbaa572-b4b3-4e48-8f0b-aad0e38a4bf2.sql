ALTER TABLE public.delivery_order_items
ADD COLUMN IF NOT EXISTS production_center_id uuid REFERENCES public.pdv_production_centers(id);

CREATE INDEX IF NOT EXISTS idx_delivery_order_items_center
  ON public.delivery_order_items(production_center_id);

ALTER TABLE public.pdv_print_jobs
DROP CONSTRAINT IF EXISTS pdv_print_jobs_source_kind_check;

ALTER TABLE public.pdv_print_jobs
ADD CONSTRAINT pdv_print_jobs_source_kind_check
CHECK (source_kind = ANY (ARRAY['comanda'::text, 'order'::text, 'delivery'::text]));

CREATE OR REPLACE VIEW public.vw_print_bridge_delivery_items AS
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
  o.customer_name,
  o.customer_phone,
  o.order_type,
  o.delivery_address_text,
  o.user_id AS tenant_user_id
FROM public.delivery_order_items oi
JOIN public.delivery_orders o ON o.id = oi.order_id
LEFT JOIN public.pdv_production_centers pc ON pc.id = oi.production_center_id;