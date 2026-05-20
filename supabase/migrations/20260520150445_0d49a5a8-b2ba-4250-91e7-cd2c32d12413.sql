
CREATE OR REPLACE FUNCTION public.pdv_finalize_paid_order(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_order RECORD;
  v_now timestamptz := now();
  v_unpaid int;
  v_in_charge int;
BEGIN
  IF NOT public.has_pdv_action(auth.uid(), 'cancel_item') THEN
    RAISE EXCEPTION 'Sem permissão para finalizar pedido';
  END IF;

  SELECT * INTO v_order FROM public.pdv_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  v_owner := public.pdv_resolve_owner(auth.uid());
  IF v_order.user_id <> v_owner THEN
    RAISE EXCEPTION 'Pedido de outro estabelecimento';
  END IF;

  IF v_order.status IN ('cancelada','fechado') THEN
    RAISE EXCEPTION 'Pedido já finalizado (status: %)', v_order.status;
  END IF;

  -- Há itens pendentes ainda em cobrança ativa?
  SELECT COUNT(*) INTO v_in_charge
  FROM public.pdv_comanda_items ci
  JOIN public.pdv_comandas c ON c.id = ci.comanda_id
  WHERE c.order_id = p_order_id
    AND ci.charging_session_id IS NOT NULL
    AND COALESCE(ci.paid_quantity, 0) < ci.quantity;
  IF v_in_charge > 0 THEN
    RAISE EXCEPTION 'Existem itens em sessão de cobrança aberta — feche a cobrança antes';
  END IF;

  -- Há itens não pagos?
  SELECT COUNT(*) INTO v_unpaid
  FROM public.pdv_comanda_items ci
  JOIN public.pdv_comandas c ON c.id = ci.comanda_id
  WHERE c.order_id = p_order_id
    AND COALESCE(ci.paid_quantity, 0) < ci.quantity;
  IF v_unpaid > 0 THEN
    RAISE EXCEPTION 'Pedido ainda possui % itens não pagos — finalize o pagamento normalmente', v_unpaid;
  END IF;

  -- Marca comandas com itens pagos como 'paga' e comandas vazias como 'cancelada'
  UPDATE public.pdv_comandas c
     SET status = CASE
                    WHEN EXISTS (SELECT 1 FROM public.pdv_comanda_items i WHERE i.comanda_id = c.id)
                      THEN 'paga'
                    ELSE 'cancelada'
                  END,
         close_reason = COALESCE(p_reason, close_reason),
         closed_by_user_id = COALESCE(closed_by_user_id, auth.uid()),
         closed_by_waiter_at = COALESCE(closed_by_waiter_at, v_now),
         updated_at = v_now
   WHERE c.order_id = p_order_id
     AND c.status IN ('aberta','aguardando_pagamento','em_cobranca','fechada');

  UPDATE public.pdv_orders
     SET status = 'fechado',
         closed_at = v_now,
         updated_at = v_now
   WHERE id = p_order_id;

  UPDATE public.pdv_tables
     SET current_order_id = NULL,
         status = 'livre',
         updated_at = v_now
   WHERE current_order_id = p_order_id;

  PERFORM public.log_pdv_action(
    'close_attendance', 'order', p_order_id, 'order', p_order_id,
    jsonb_build_object('finalized_paid', true),
    p_reason
  );

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id);
END;
$function$;
