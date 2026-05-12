CREATE OR REPLACE FUNCTION public.pdv_transfer_items(p_item_ids uuid[], p_qty_map jsonb, p_target_kind text, p_target_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_role public.app_role;
  v_target_comanda_id uuid;
  v_target_order_id uuid;
  v_table RECORD;
  v_item RECORD;
  v_qty numeric;
  v_split_id uuid;
  v_action public.pdv_permission_action;
  v_moved jsonb := '[]'::jsonb;
BEGIN
  IF p_item_ids IS NULL OR array_length(p_item_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Nenhum item selecionado';
  END IF;
  IF p_target_kind NOT IN ('comanda','table') THEN
    RAISE EXCEPTION 'Destino inválido';
  END IF;

  v_owner := public.pdv_resolve_owner(auth.uid());
  v_role  := public.pdv_user_role(auth.uid());

  IF p_target_kind = 'comanda' THEN
    SELECT id, order_id INTO v_target_comanda_id, v_target_order_id
      FROM public.pdv_comandas WHERE id = p_target_id AND user_id = v_owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'Comanda destino não encontrada'; END IF;
  ELSE
    SELECT * INTO v_table FROM public.pdv_tables WHERE id = p_target_id AND user_id = v_owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mesa destino não encontrada'; END IF;

    IF v_table.current_order_id IS NULL THEN
      INSERT INTO public.pdv_orders (user_id, table_id, source, status, order_number, opened_by, opened_at)
      VALUES (v_owner, v_table.id, 'salao', 'aberto',
              'ORD-' || to_char(now(),'YYYYMMDDHH24MISS'),
              auth.uid(), now())
      RETURNING id INTO v_target_order_id;

      INSERT INTO public.pdv_comandas (user_id, order_id, comanda_number, status)
      VALUES (v_owner, v_target_order_id,
              'CMD-' || to_char(now(),'YYYYMMDDHH24MISS'),
              'aberta')
      RETURNING id INTO v_target_comanda_id;

      UPDATE public.pdv_tables
         SET current_order_id = v_target_order_id,
             status = 'ocupada',
             updated_at = now()
       WHERE id = v_table.id;
    ELSE
      v_target_order_id := v_table.current_order_id;
      SELECT id INTO v_target_comanda_id
        FROM public.pdv_comandas
       WHERE order_id = v_target_order_id AND status = 'aberta'
       ORDER BY created_at ASC LIMIT 1;
      IF v_target_comanda_id IS NULL THEN
        INSERT INTO public.pdv_comandas (user_id, order_id, comanda_number, status)
        VALUES (v_owner, v_target_order_id,
                'CMD-' || to_char(now(),'YYYYMMDDHH24MISS'),
                'aberta')
        RETURNING id INTO v_target_comanda_id;
      END IF;
    END IF;
  END IF;

  FOR v_item IN
    SELECT ci.*, c.order_id AS src_order_id, c.user_id AS src_owner
      FROM public.pdv_comanda_items ci
      JOIN public.pdv_comandas c ON c.id = ci.comanda_id
     WHERE ci.id = ANY(p_item_ids)
     FOR UPDATE
  LOOP
    IF v_item.src_owner <> v_owner THEN
      RAISE EXCEPTION 'Item de outro estabelecimento';
    END IF;
    IF v_item.comanda_id = v_target_comanda_id THEN
      CONTINUE;
    END IF;
    IF COALESCE(v_item.paid_quantity,0) >= v_item.quantity THEN
      RAISE EXCEPTION 'Item % já totalmente pago', v_item.product_name;
    END IF;
    IF v_item.charging_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'Item % está em cobrança', v_item.product_name;
    END IF;

    v_qty := COALESCE((p_qty_map->>v_item.id::text)::numeric,
                      v_item.quantity - COALESCE(v_item.paid_quantity,0));

    IF v_qty < (v_item.quantity - COALESCE(v_item.paid_quantity,0)) THEN
      v_split_id := public.pdv_split_comanda_item(v_item.id, v_qty);
      UPDATE public.pdv_comanda_items
         SET comanda_id = v_target_comanda_id
       WHERE id = v_split_id;
      v_moved := v_moved || jsonb_build_object('item_id', v_split_id, 'qty', v_qty, 'from_item', v_item.id);
    ELSE
      UPDATE public.pdv_comanda_items
         SET comanda_id = v_target_comanda_id
       WHERE id = v_item.id;
      v_moved := v_moved || jsonb_build_object('item_id', v_item.id, 'qty', v_qty);
    END IF;

    IF v_item.src_order_id IS NOT NULL AND p_target_kind = 'table' THEN
      v_action := 'transfer_table_to_table';
    ELSIF v_item.src_order_id IS NOT NULL AND p_target_kind = 'comanda' THEN
      v_action := 'transfer_table_to_comanda';
    ELSIF v_item.src_order_id IS NULL AND p_target_kind = 'table' THEN
      v_action := 'transfer_comanda_to_table';
    ELSE
      v_action := 'transfer_comanda_to_comanda';
    END IF;

    IF NOT public.has_pdv_action(auth.uid(), v_action) THEN
      RAISE EXCEPTION 'Sem permissão para esta transferência';
    END IF;
  END LOOP;

  PERFORM public.log_pdv_action(
    'transfer_comanda_to_comanda',
    'comanda', NULL,
    p_target_kind, p_target_id,
    jsonb_build_object('items', v_moved, 'target_kind', p_target_kind),
    p_reason
  );

  RETURN jsonb_build_object('ok', true, 'target_comanda_id', v_target_comanda_id, 'moved', v_moved);
END;
$function$;