CREATE OR REPLACE FUNCTION public.pdv_change_table(
  p_source_table_id uuid,
  p_target_table_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_src RECORD;
  v_dst RECORD;
  v_src_order uuid;
  v_dst_order uuid;
  v_merged boolean := false;
  v_charging_count int;
BEGIN
  IF NOT public.has_pdv_action(auth.uid(), 'change_table') THEN
    RAISE EXCEPTION 'Sem permissão para trocar mesa';
  END IF;
  IF p_source_table_id = p_target_table_id THEN
    RAISE EXCEPTION 'Mesa origem e destino são iguais';
  END IF;

  SELECT * INTO v_src FROM public.pdv_tables WHERE id = p_source_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mesa de origem não encontrada'; END IF;
  SELECT * INTO v_dst FROM public.pdv_tables WHERE id = p_target_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mesa de destino não encontrada'; END IF;

  v_owner := public.pdv_resolve_owner(auth.uid());
  IF v_src.user_id <> v_owner OR v_dst.user_id <> v_owner THEN
    RAISE EXCEPTION 'Mesa de outro estabelecimento';
  END IF;

  IF v_src.current_order_id IS NULL THEN
    RAISE EXCEPTION 'Mesa de origem está livre';
  END IF;

  v_src_order := v_src.current_order_id;

  IF v_dst.current_order_id IS NULL AND v_dst.status = 'livre' THEN
    -- Comportamento original: mover order para a mesa destino
    UPDATE public.pdv_orders
       SET table_id = p_target_table_id,
           updated_at = now()
     WHERE id = v_src_order;

    UPDATE public.pdv_tables
       SET current_order_id = v_src_order,
           status = v_src.status,
           updated_at = now()
     WHERE id = p_target_table_id;

    UPDATE public.pdv_tables
       SET current_order_id = NULL,
           status = 'livre',
           updated_at = now()
     WHERE id = p_source_table_id;
  ELSE
    -- Merge: mesa destino já ocupada
    v_merged := true;
    v_dst_order := v_dst.current_order_id;

    IF v_dst_order IS NULL THEN
      RAISE EXCEPTION 'Mesa de destino está em estado inconsistente';
    END IF;

    -- Bloquear se houver comanda em cobrança em qualquer um dos lados
    SELECT COUNT(*) INTO v_charging_count
      FROM public.pdv_comandas
     WHERE order_id IN (v_src_order, v_dst_order)
       AND status IN ('em_cobranca','aguardando_pagamento');
    IF v_charging_count > 0 THEN
      RAISE EXCEPTION 'Não é possível mesclar: existe comanda em cobrança ou aguardando pagamento';
    END IF;

    -- Reatribuir comandas abertas da origem para o order destino
    UPDATE public.pdv_comandas
       SET order_id = v_dst_order,
           updated_at = now()
     WHERE order_id = v_src_order
       AND status = 'aberta';

    -- Fechar order antigo da origem (já sem comandas abertas)
    UPDATE public.pdv_orders
       SET status = 'fechado',
           closed_at = now(),
           updated_at = now()
     WHERE id = v_src_order;

    -- Liberar a mesa de origem
    UPDATE public.pdv_tables
       SET current_order_id = NULL,
           status = 'livre',
           updated_at = now()
     WHERE id = p_source_table_id;

    -- Garantir que a mesa destino esteja como ocupada
    UPDATE public.pdv_tables
       SET status = 'ocupada',
           updated_at = now()
     WHERE id = p_target_table_id
       AND status <> 'ocupada';
  END IF;

  PERFORM public.log_pdv_action(
    'change_table', 'table', p_source_table_id, 'table', p_target_table_id,
    jsonb_build_object('order_id', v_src_order, 'merged', v_merged, 'target_order_id', v_dst_order),
    p_reason
  );

  RETURN jsonb_build_object('ok', true, 'order_id', v_src_order, 'merged', v_merged, 'target_order_id', v_dst_order);
END;
$$;