-- Impressão de delivery · fila no servidor deixa de ser exceção e vira padrão
--
-- Problema: enqueue_delivery_prints_sweep() estava fixada em um único
-- estabelecimento (Koten Garibaldi). Para todos os outros, a impressão
-- automática dependia exclusivamente de alguém estar com a tela do PDV aberta
-- no navegador. Se a aba fechasse, o computador dormisse ou a conexão
-- oscilasse, o pedido entrava e NENHUM job era criado: sem erro, sem registro,
-- sem nada para investigar depois.
--
-- Medido no La Vecchia entre 28 e 29/07: de 9 pedidos, apenas 3 imprimiram
-- sozinhos (2 segundos cada). Os outros 6 só saíram quando alguém percebeu e
-- clicou em reimprimir, com atrasos de 1,5 a 91 minutos.
--
-- Mudança: o estabelecimento fixo sai e entra um recorte que se auto-configura,
-- limitado a quem tem ao menos uma impressora cadastrada. Assim o
-- estabelecimento sem impressora não passa a acumular job falhado
-- ("sem impressora configurada") nem a disparar o alerta de impressora offline.
--
-- Todo o resto do corpo é idêntico ao que já rodava em produção.

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
begin
  for r_order in
    select o.*
    from public.delivery_orders o
    where o.created_at > now() - interval '15 minutes'
      and o.status <> 'cancelled'
      and o.order_type in ('delivery','pickup')
      -- só estabelecimentos que realmente imprimem
      and exists (
        select 1
        from public.pdv_production_centers pc2
        where pc2.user_id = o.user_id
          and pc2.printer_ip is not null
      )
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
$function$;

COMMENT ON FUNCTION public.enqueue_delivery_prints_sweep() IS
  'Rede de segurança da impressão de delivery: enfileira comandas de cozinha independentemente do navegador do PDV estar aberto. Roda a cada 30s pelo cron velara-delivery-print-sweep. Vale para todo estabelecimento com impressora cadastrada.';
