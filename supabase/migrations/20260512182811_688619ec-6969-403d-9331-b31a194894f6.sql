-- A. Recalcular ambas as comandas (origem e destino) ao mover itens
CREATE OR REPLACE FUNCTION public.update_comanda_subtotal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.comanda_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.comanda_id END
    ]) AS x WHERE x IS NOT NULL
  LOOP
    UPDATE public.pdv_comandas
       SET subtotal = COALESCE((
             SELECT SUM(subtotal) FROM public.pdv_comanda_items WHERE comanda_id = v_id
           ), 0),
           pending_subtotal = COALESCE((
             SELECT SUM(unit_price * GREATEST(quantity - paid_quantity, 0))
             FROM public.pdv_comanda_items WHERE comanda_id = v_id
           ), 0),
           updated_at = now()
     WHERE id = v_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- B+C. pdv_transfer_items: aceita nome opcional para a comanda criada na mesa destino,
-- e libera a mesa de origem quando o pedido fica vazio.
CREATE OR REPLACE FUNCTION public.pdv_transfer_items(
  p_item_ids uuid[],
  p_qty_map jsonb,
  p_target_kind text,
  p_target_id uuid,
  p_reason text DEFAULT NULL,
  p_target_comanda_name text DEFAULT NULL
)
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
  v_src_order_ids uuid[] := ARRAY[]::uuid[];
  v_src_order uuid;
  v_clean_name text;
BEGIN
  IF p_item_ids IS NULL OR array_length(p_item_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Nenhum item selecionado';
  END IF;
  IF p_target_kind NOT IN ('comanda','table') THEN
    RAISE EXCEPTION 'Destino inválido';
  END IF;

  v_owner := public.pdv_resolve_owner(auth.uid());
  v_role  := public.pdv_user_role(auth.uid());
  v_clean_name := NULLIF(trim(COALESCE(p_target_comanda_name, '')), '');

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

      INSERT INTO public.pdv_comandas (user_id, order_id, comanda_number, status, customer_name)
      VALUES (v_owner, v_target_order_id,
              'CMD-' || to_char(now(),'YYYYMMDDHH24MISS'),
              'aberta', v_clean_name)
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
        INSERT INTO public.pdv_comandas (user_id, order_id, comanda_number, status, customer_name)
        VALUES (v_owner, v_target_order_id,
                'CMD-' || to_char(now(),'YYYYMMDDHH24MISS'),
                'aberta', v_clean_name)
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

    IF v_item.src_order_id IS NOT NULL AND NOT (v_item.src_order_id = ANY(v_src_order_ids)) THEN
      v_src_order_ids := array_append(v_src_order_ids, v_item.src_order_id);
    END IF;
  END LOOP;

  -- Liberar mesas de origem que ficaram sem itens em nenhuma comanda aberta
  FOREACH v_src_order IN ARRAY v_src_order_ids LOOP
    IF v_src_order = v_target_order_id THEN CONTINUE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.pdv_comanda_items ci
      JOIN public.pdv_comandas c ON c.id = ci.comanda_id
      WHERE c.order_id = v_src_order
    ) THEN
      UPDATE public.pdv_comandas
         SET status = 'cancelada',
             updated_at = now()
       WHERE order_id = v_src_order
         AND status = 'aberta';

      UPDATE public.pdv_orders
         SET status = 'fechado',
             closed_at = now(),
             updated_at = now()
       WHERE id = v_src_order;

      UPDATE public.pdv_tables
         SET current_order_id = NULL,
             status = 'livre',
             updated_at = now()
       WHERE current_order_id = v_src_order;
    END IF;
  END LOOP;

  PERFORM public.log_pdv_action(
    'transfer_comanda_to_comanda',
    'comanda', NULL,
    p_target_kind, p_target_id,
    jsonb_build_object('items', v_moved, 'target_kind', p_target_kind, 'target_comanda_name', v_clean_name),
    p_reason
  );

  RETURN jsonb_build_object('ok', true, 'target_comanda_id', v_target_comanda_id, 'moved', v_moved);
END;
$function$;