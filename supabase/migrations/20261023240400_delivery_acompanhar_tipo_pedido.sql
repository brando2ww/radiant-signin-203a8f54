-- Acompanhamento do cardápio online passa a devolver o tipo do pedido.
--
-- Sem order_type a tela do cliente não sabe se é entrega ou retirada e mostra
-- tudo como entrega: pedido de retirada aparecia como "Saiu para entrega · Já
-- está a caminho do seu endereço" e "Pague ao entregador" (chamado do Sertão
-- Adentro, 23/10/2026).
--
-- Mesma assinatura, mesmo corpo, só a chave nova. Grants não mudam (create or
-- replace mantém os da função). delivery_pedido_confirmar_recebimento devolve
-- esta mesma função, então passa a trazer order_type também.

create or replace function public.delivery_pedido_acompanhar(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', id, 'order_number', order_number, 'status', status,
    'order_type', order_type,
    'payment_method', payment_method, 'payment_status', payment_status,
    'change_for', change_for, 'total', total, 'cancellation_reason', cancellation_reason,
    'cashier_confirmed_at', cashier_confirmed_at,
    'customer_delivery_confirmed_at', customer_delivery_confirmed_at,
    'created_at', created_at, 'confirmed_at', confirmed_at, 'ready_at', ready_at,
    'delivered_at', delivered_at, 'cancelled_at', cancelled_at)
  from delivery_orders where id = p_order_id
$$;
