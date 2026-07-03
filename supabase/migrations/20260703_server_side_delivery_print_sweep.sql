-- Enfileiramento server-side de impressao de delivery (backstop ao dispatch do navegador).
-- Aplicado em produção (frbziqazwhymwsrtneoy) via Management API em 03/07/2026.
-- Escopado ao tenant KOTEN SUSHI (d9087102-9bff-491e-ac9d-8429f62b42dd).
-- Idempotente: usa a chave (source_item_id=orderId, center_id) + índice único; coexiste com o dispatch do navegador sem duplicar.
-- Agendado via pg_cron: select cron.schedule('velara-delivery-print-sweep','30 seconds','select public.enqueue_delivery_prints_sweep();');

create or replace function public.enqueue_delivery_prints_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r_order record;
  r_center record;
  v_short text;
  v_items jsonb;
  v_payload jsonb;
begin
  for r_order in
    select o.*
    from public.delivery_orders o
    where o.user_id = 'd9087102-9bff-491e-ac9d-8429f62b42dd'::uuid
      and o.created_at > now() - interval '15 minutes'
      and o.status <> 'cancelled'
      and o.order_type in ('delivery','pickup')
  loop
    v_short := coalesce(
      case when r_order.ticket_number is not null then lpad(r_order.ticket_number::text, 3, '0') end,
      regexp_replace(coalesce(r_order.order_number, ''), '^#+', '')
    );

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
  end loop;

  return v_count;
end;
$$;
