-- Remove unicidade global de order_number (a unicidade correta é por sessão de caixa,
-- já garantida por uq_delivery_orders_session_ticket).
ALTER TABLE public.delivery_orders
  DROP CONSTRAINT IF EXISTS delivery_orders_order_number_key;

-- Backfill do pedido órfão atual.
SELECT public.delivery_assign_order_ticket('f69929d2-5074-472f-97a2-e8a6ce6dc471'::uuid);