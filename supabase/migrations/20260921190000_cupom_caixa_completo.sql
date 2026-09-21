-- Cupom do caixa (tele-entrega) saía sem complementos e sem o valor de cada item.
-- Pedido da La Vecchia de 21/09 18:33: o robô passou entre a gravação dos itens
-- e a dos complementos, e o cupom do caixa, que é gerado uma vez só, ficou
-- incompleto. A cozinha saiu 30s depois, já completa.

CREATE OR REPLACE FUNCTION public.enqueue_delivery_prints_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int := 0;
  r_order record;
  r_center record;
  v_short text;
  v_items jsonb;
  v_payload jsonb;
  v_all_items jsonb;
  v_complement text;
  v_reference text;
begin
  for r_order in
    select o.*
    from public.delivery_orders o
    where o.created_at > now() - interval '15 minutes'
      -- O cardápio online grava o pedido em três idas do celular do cliente
      -- (pedido, itens, complementos). Pegar antes disso imprimia o cupom
      -- do caixa sem os complementos, e ele só é gerado uma vez.
      and o.created_at < now() - interval '20 seconds'
      and o.status <> 'cancelled'
      and o.order_type in ('delivery','pickup')
      -- só estabelecimentos que realmente imprimem
      and exists (
        select 1
        from public.pdv_production_centers pc2
        where pc2.user_id = o.user_id
          and pc2.printer_ip is not null
          and pc2.is_active
      )
  loop
    v_short := coalesce(
      case when r_order.ticket_number is not null then lpad(r_order.ticket_number::text, 3, '0') end,
      regexp_replace(coalesce(r_order.order_number, ''), '^#+', '')
    );

    -- ---------------- via de produção (cozinha, bar, ...) ----------------
    for r_center in
      select oi.production_center_id as center_id,
             pc.name as center_name,
             pc.printer_ip as printer_ip,
             coalesce(pc.printer_port, 9100) as printer_port
      from public.delivery_order_items oi
      left join public.pdv_production_centers pc on pc.id = oi.production_center_id
      where oi.order_id = r_order.id
      group by oi.production_center_id, pc.name, pc.printer_ip, pc.printer_port
    loop
      -- já existe job para (pedido, centro)? pula (cobre inclusive centro NULL)
      if exists (
        select 1 from public.pdv_print_jobs j
        where j.source_kind = 'delivery'
          and j.source_item_id = r_order.id
          and j.center_id is not distinct from r_center.center_id
      ) then
        continue;
      end if;

      select jsonb_agg(
               jsonb_build_object(
                 'product_name', oi.product_name,
                 'quantity', oi.quantity,
                 'notes', oi.notes,
                 'modifiers', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'name', case when coalesce(op.quantity, 1) > 1
                                         then op.quantity::text || 'x ' || op.item_name
                                         else op.item_name end))
                   from public.delivery_order_item_options op
                   where op.order_item_id = oi.id and op.item_name is not null
                 ), '[]'::jsonb)
               )
               order by oi.id
             )
      into v_items
      from public.delivery_order_items oi
      where oi.order_id = r_order.id
        and oi.production_center_id is not distinct from r_center.center_id;

      v_payload := jsonb_build_object(
        'kind', 'delivery',
        'mesa_numero', 'DELIVERY',
        'comanda_nome', coalesce(r_order.customer_name, 'Cliente'),
        'comanda_number', v_short,
        'ticket_number', r_order.ticket_number,
        'order_number', v_short,
        'customer_name', r_order.customer_name,
        'customer_phone', r_order.customer_phone,
        'order_type', r_order.order_type,
        'delivery_address', r_order.delivery_address_text,
        'items', coalesce(v_items, '[]'::jsonb)
      );

      begin
        insert into public.pdv_print_jobs
          (tenant_user_id, source_kind, source_item_id, center_id, center_name,
           printer_ip, printer_port, payload, status, error_message)
        values
          (r_order.user_id, 'delivery', r_order.id, r_center.center_id, r_center.center_name,
           r_center.printer_ip, r_center.printer_port, v_payload,
           case when r_center.printer_ip is not null then 'pending' else 'failed' end,
           case when r_center.printer_ip is not null then null else 'sem impressora configurada' end);
        v_count := v_count + 1;
      exception when unique_violation then
        null; -- corrida com o dispatch do navegador: ok
      end;
    end loop;

    -- ---------------- via completa do caixa (print_complete) ----------------
    v_all_items := null;
    v_complement := null;
    v_reference := null;

    for r_center in
      select pc.id as center_id,
             pc.name as center_name,
             pc.printer_ip as printer_ip,
             coalesce(pc.printer_port, 9100) as printer_port
      from public.pdv_production_centers pc
      where pc.user_id = r_order.user_id
        and pc.is_active
        and pc.print_complete
    loop
      if exists (
        select 1 from public.pdv_print_jobs j
        where j.source_kind = 'comanda_caixa'
          and j.source_item_id = r_order.id
          and j.center_id is not distinct from r_center.center_id
      ) then
        continue;
      end if;

      -- Itens e endereço completo custam caro: só monta quando há o que imprimir.
      if v_all_items is null then
        select jsonb_agg(
                 jsonb_build_object(
                   'product_name', oi.product_name,
                   'quantity', oi.quantity,
                   'notes', oi.notes,
                   -- O cupom do caixa é o que o cliente confere: vai o valor do
                   -- item e o complemento como aparece na tela do pedido.
                   'unit_price', oi.unit_price,
                   'subtotal', oi.subtotal,
                   'modifiers', coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'name',
                              case when coalesce(op.quantity, 1) > 1 then op.quantity::text || 'x ' else '' end
                              || case when nullif(btrim(coalesce(op.option_name, '')), '') is not null
                                      then btrim(op.option_name) || ': ' else '' end
                              || op.item_name
                              || case when coalesce(op.price_adjustment, 0) > 0
                                      then ' (+' || replace(to_char(op.price_adjustment * coalesce(op.quantity, 1), 'FM999999990.00'), '.', ',') || ')'
                                      else '' end))
                     from public.delivery_order_item_options op
                     where op.order_item_id = oi.id and op.item_name is not null
                   ), '[]'::jsonb)
                 )
                 order by oi.id
               )
        into v_all_items
        from public.delivery_order_items oi
        where oi.order_id = r_order.id;

        v_all_items := coalesce(v_all_items, '[]'::jsonb);

        -- Complemento e referência não cabem no delivery_address_text (linha
        -- única) e são justamente o que o entregador precisa.
        if r_order.delivery_address_id is not null then
          select nullif(btrim(coalesce(da.complement, '')), ''),
                 nullif(btrim(coalesce(da.reference, '')), '')
            into v_complement, v_reference
            from public.delivery_addresses da
           where da.id = r_order.delivery_address_id;
        end if;
      end if;

      v_payload := jsonb_build_object(
        'kind', 'comanda_caixa',
        'order_number', r_order.order_number,
        'ticket_number', r_order.ticket_number,
        'customer_name', r_order.customer_name,
        'customer_phone', r_order.customer_phone,
        'order_type', r_order.order_type,
        'delivery_address', r_order.delivery_address_text,
        'delivery_complement', v_complement,
        'delivery_reference', v_reference,
        'subtotal', r_order.subtotal,
        'delivery_fee', r_order.delivery_fee,
        'discount_amount', r_order.discount,
        'total', r_order.total,
        'payment_method', r_order.payment_method,
        'payment_status', r_order.payment_status,
        'change_amount', r_order.change_for,
        'notes', r_order.notes,
        'items', v_all_items
      );

      begin
        insert into public.pdv_print_jobs
          (tenant_user_id, source_kind, source_item_id, center_id, center_name,
           printer_ip, printer_port, payload, status, error_message)
        values
          (r_order.user_id, 'comanda_caixa', r_order.id, r_center.center_id, r_center.center_name,
           r_center.printer_ip, r_center.printer_port, v_payload,
           case when r_center.printer_ip is not null then 'pending' else 'failed' end,
           case when r_center.printer_ip is not null then null else 'sem impressora configurada' end);
        v_count := v_count + 1;
      exception when unique_violation then
        null; -- corrida com dispatchCaixaJobs: ok
      end;
    end loop;
  end loop;

  return v_count;
end;
$function$;
