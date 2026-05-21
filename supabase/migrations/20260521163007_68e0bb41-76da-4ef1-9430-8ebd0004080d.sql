-- 1. Cancellation columns
ALTER TABLE public.pdv_comandas
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_category text,
  ADD COLUMN IF NOT EXISTS customer_notified boolean NOT NULL DEFAULT false;

-- 2. New permission action enum value
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'cancel_comanda'
      AND enumtypid = 'public.pdv_permission_action'::regtype
  ) THEN
    ALTER TYPE public.pdv_permission_action ADD VALUE 'cancel_comanda';
  END IF;
END $$;

-- 3. RPC to cancel a comanda with audit
CREATE OR REPLACE FUNCTION public.pdv_cancel_comanda(
  p_comanda_id uuid,
  p_reason text,
  p_category text,
  p_customer_notified boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_comanda RECORD;
  v_table_number text;
  v_items_count int;
  v_now timestamptz := now();
  v_open_remaining int;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'Motivo do cancelamento deve ter pelo menos 20 caracteres';
  END IF;
  IF COALESCE(p_customer_notified, false) = false THEN
    RAISE EXCEPTION 'É obrigatório confirmar que o cliente foi informado';
  END IF;
  IF p_category IS NULL OR length(trim(p_category)) = 0 THEN
    RAISE EXCEPTION 'Categoria do cancelamento é obrigatória';
  END IF;

  IF NOT public.has_pdv_action(auth.uid(), 'cancel_comanda') THEN
    RAISE EXCEPTION 'Sem permissão para cancelar comandas';
  END IF;

  SELECT * INTO v_comanda
  FROM public.pdv_comandas
  WHERE id = p_comanda_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda não encontrada';
  END IF;

  v_owner := public.pdv_resolve_owner(auth.uid());
  IF v_comanda.user_id <> v_owner THEN
    RAISE EXCEPTION 'Comanda de outro estabelecimento';
  END IF;

  IF v_comanda.status NOT IN ('aberta', 'em_cobranca', 'aguardando_pagamento') THEN
    RAISE EXCEPTION 'Comanda não pode ser cancelada (status atual: %)', v_comanda.status;
  END IF;

  SELECT table_number INTO v_table_number
  FROM public.pdv_tables t
  JOIN public.pdv_orders o ON o.table_id = t.id
  WHERE o.id = v_comanda.order_id
  LIMIT 1;

  SELECT COUNT(*) INTO v_items_count
  FROM public.pdv_comanda_items
  WHERE comanda_id = p_comanda_id;

  UPDATE public.pdv_comandas
     SET status = 'cancelada',
         cancelled_at = v_now,
         cancelled_by_user_id = auth.uid(),
         cancellation_reason = trim(p_reason),
         cancellation_category = trim(p_category),
         customer_notified = true,
         closed_by_user_id = auth.uid(),
         updated_at = v_now
   WHERE id = p_comanda_id;

  -- Free the table if no other open comandas remain on the same order
  IF v_comanda.order_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_open_remaining
    FROM public.pdv_comandas
    WHERE order_id = v_comanda.order_id
      AND status NOT IN ('fechada', 'cancelada');

    IF v_open_remaining = 0 THEN
      UPDATE public.pdv_orders
         SET status = 'fechado',
             closed_at = v_now,
             updated_at = v_now
       WHERE id = v_comanda.order_id;

      UPDATE public.pdv_tables
         SET current_order_id = NULL,
             status = 'livre',
             updated_at = v_now
       WHERE current_order_id = v_comanda.order_id;
    END IF;
  END IF;

  PERFORM public.log_pdv_action(
    'cancel_comanda',
    'pdv_comanda', p_comanda_id,
    CASE WHEN v_comanda.order_id IS NOT NULL THEN 'pdv_order' ELSE NULL END,
    v_comanda.order_id,
    jsonb_build_object(
      'category', trim(p_category),
      'customer_notified', true,
      'comanda_number', v_comanda.comanda_number,
      'customer_name', v_comanda.customer_name,
      'table_number', v_table_number,
      'subtotal', v_comanda.subtotal,
      'items_count', v_items_count,
      'previous_status', v_comanda.status
    ),
    trim(p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'comanda_id', p_comanda_id);
END;
$$;