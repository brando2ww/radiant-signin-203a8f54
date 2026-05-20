
-- Mesa 12 - pedido pago mas travado
UPDATE public.pdv_comandas
   SET status='paga',
       closed_by_waiter_at = COALESCE(closed_by_waiter_at, now()),
       close_reason = COALESCE(close_reason, 'Finalização manual - pedido pago mas travado'),
       updated_at = now()
 WHERE id = '22bc9e51-c1b8-4462-83f7-978b3e0d23f4';

UPDATE public.pdv_comandas
   SET status='cancelada',
       close_reason = 'Comanda vazia criada por erro - encerramento manual',
       updated_at = now()
 WHERE order_id = '7f23829d-598a-4ce3-81df-6314ba2a5166'
   AND id <> '22bc9e51-c1b8-4462-83f7-978b3e0d23f4'
   AND status NOT IN ('paga','cancelada');

UPDATE public.pdv_orders
   SET status='fechado', closed_at = now(), updated_at = now()
 WHERE id = '7f23829d-598a-4ce3-81df-6314ba2a5166';

UPDATE public.pdv_tables
   SET current_order_id = NULL, status='livre', updated_at = now()
 WHERE current_order_id = '7f23829d-598a-4ce3-81df-6314ba2a5166';

-- Pedido órfão PDV246017
UPDATE public.pdv_orders
   SET status='cancelada',
       cancelled_at = now(),
       cancellation_reason = 'Pedido órfão sem comandas - limpeza manual',
       updated_at = now()
 WHERE order_number = 'PDV246017'
   AND status NOT IN ('cancelada','fechado');

UPDATE public.pdv_tables
   SET current_order_id = NULL, status='livre', updated_at = now()
 WHERE current_order_id IN (SELECT id FROM public.pdv_orders WHERE order_number = 'PDV246017');
