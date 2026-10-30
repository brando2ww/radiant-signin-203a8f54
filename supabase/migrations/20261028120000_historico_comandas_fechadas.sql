-- Histórico somente leitura: inclui comandas de mesa e avulsas, sem depender do caixa atual.
begin;

create or replace function public.pdv_historico_comandas(
  p_owner uuid, p_de date default null, p_ate date default null,
  p_busca text default '', p_offset integer default 0, p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.pdv_cashback_pode(p_owner) or not public.has_pdv_action(auth.uid(), 'view_history') then
    raise exception 'Sem permissão para consultar o histórico desta loja' using errcode = '42501';
  end if;
  if p_de is not null and p_ate is not null and p_de > p_ate then
    raise exception 'A data inicial deve ser anterior ou igual à final' using errcode = '22023';
  end if;
  with filtradas as (
    select c.id, c.order_id, c.comanda_number as numero, c.customer_name as cliente,
           c.customer_phone as telefone, c.created_at as aberta_em, c.updated_at as fechada_em,
           c.subtotal as consumo, t.table_number as mesa,
           case when c.order_id is null then 'Balcão / avulsa'
                when t.is_virtual or o.source = 'balcao' then 'Balcão'
                when t.table_number is not null then 'Mesa ' || regexp_replace(t.table_number, '^mesa\s*', '', 'i')
                else 'Mesa não identificada' end as local,
           o.order_number as atendimento_numero
      from public.pdv_comandas c
      left join public.pdv_orders o on o.id = c.order_id and o.user_id = p_owner
      left join public.pdv_tables t on t.id = o.table_id and t.user_id = p_owner
     where c.user_id = p_owner and c.status = 'fechada'
       and (p_de is null or c.updated_at >= (p_de::timestamp at time zone 'America/Sao_Paulo'))
       and (p_ate is null or c.updated_at < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'))
       and (nullif(btrim(p_busca), '') is null or
         position(translate(lower(btrim(p_busca)), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn') in
           translate(lower(concat_ws(' ', c.comanda_number, c.customer_name,
             c.customer_phone, t.table_number, 'Mesa ' || t.table_number, o.order_number)),
             'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')) > 0 or
         (btrim(p_busca) ~* '^mesa\s*0*[0-9]+$' and
           regexp_replace(regexp_replace(t.table_number, '^mesa\s*', '', 'i'), '^0+', '') =
           regexp_replace(regexp_replace(btrim(p_busca), '^mesa\s*', '', 'i'), '^0+', '')) or
         (length(regexp_replace(p_busca, '\D', '', 'g')) >= 4 and
          position(regexp_replace(p_busca, '\D', '', 'g') in regexp_replace(coalesce(c.customer_phone, ''), '\D', '', 'g')) > 0))
  ), pagina as (
    select * from filtradas order by fechada_em desc, id
     offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ), linhas as (
    select p.*, coalesce(pg.valor, mv.valor) as valor_pago,
           case when pg.valor is not null then 'atendimento' when mv.valor is not null then 'comanda' end as pagamento_escopo
      from pagina p
      left join lateral (
        select sum(pay.amount) as valor from public.pdv_payments pay
         where pay.order_id = p.order_id
           and exists (select 1 from public.pdv_orders po where po.id = pay.order_id and po.user_id = p_owner)
      ) pg on true
      left join lateral (
        select sum(m.amount) as valor from public.pdv_cashier_movements m
          join public.pdv_cashier_sessions s on s.id = m.cashier_session_id and s.user_id = p_owner
         where m.comanda_id = p.id and m.type = 'venda'
      ) mv on true
  ) select jsonb_build_object(
    'total', (select count(*) from filtradas),
    'comandas', coalesce((select jsonb_agg(to_jsonb(l) order by l.fechada_em desc, l.id) from linhas l), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.pdv_historico_comanda_detalhe(p_owner uuid, p_comanda uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_c public.pdv_comandas; v_o public.pdv_orders;
begin
  if not public.pdv_cashback_pode(p_owner) or not public.has_pdv_action(auth.uid(), 'view_history') then
    raise exception 'Sem permissão para consultar o histórico desta loja' using errcode = '42501';
  end if;
  select * into v_c from public.pdv_comandas where id = p_comanda and user_id = p_owner and status = 'fechada';
  if not found then raise exception 'Comanda fechada não encontrada' using errcode = 'P0002'; end if;
  select * into v_o from public.pdv_orders where id = v_c.order_id and user_id = p_owner;
  return jsonb_build_object(
    'comanda', jsonb_build_object('id', v_c.id, 'numero', v_c.comanda_number,
      'cliente', v_c.customer_name, 'telefone', v_c.customer_phone, 'consumo', v_c.subtotal,
      'aberta_em', v_c.created_at, 'fechada_em', v_c.updated_at, 'observacoes', v_c.notes),
    'atendimento', case when v_o.id is null then null else jsonb_build_object(
      'id', v_o.id, 'numero', v_o.order_number, 'status', v_o.status,
      'mesa', (select t.table_number from public.pdv_tables t where t.id = v_o.table_id and t.user_id = p_owner),
      'balcao', v_o.source = 'balcao' or coalesce((select t.is_virtual from public.pdv_tables t where t.id = v_o.table_id and t.user_id = p_owner), false),
      'desconto', v_o.discount, 'taxa_servico', v_o.service_fee, 'taxa_servico_paga', v_o.service_fee_paid) end,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'produto', i.product_name,
        'quantidade', i.quantity, 'preco_unitario', i.unit_price, 'subtotal', i.subtotal,
        'observacoes', i.notes, 'parent_item_id', i.parent_item_id,
        'complemento', coalesce(i.is_composite_child, false) or i.parent_item_id is not null)
        order by coalesce(i.parent_item_id, i.id), i.parent_item_id nulls first, i.created_at, i.id)
        from public.pdv_comanda_items i where i.comanda_id = v_c.id), '[]'::jsonb),
    'pagamentos_atendimento', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'valor', p.amount, 'forma', p.payment_method,
        'data', coalesce(p.processed_at, p.created_at), 'recebido', p.cash_received, 'troco', p.change_amount)
        order by coalesce(p.processed_at, p.created_at), p.id)
        from public.pdv_payments p where p.order_id = v_o.id), '[]'::jsonb),
    'movimentos_comanda', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'valor', m.amount, 'forma', m.payment_method,
        'data', m.created_at, 'motivo_desconto', m.discount_reason) order by m.created_at, m.id)
        from public.pdv_cashier_movements m
        join public.pdv_cashier_sessions s on s.id = m.cashier_session_id and s.user_id = p_owner
       where m.comanda_id = v_c.id and m.type = 'venda'), '[]'::jsonb),
    'comandas_atendimento', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'numero', c.comanda_number, 'cliente', c.customer_name,
        'status', c.status, 'consumo', c.subtotal) order by c.created_at, c.id)
        from public.pdv_comandas c where c.user_id = p_owner and c.order_id = v_o.id), '[]'::jsonb),
    'cashback_usado', coalesce((select sum(u.valor) from public.pdv_cashback_usos u
      where u.user_id = p_owner and u.comanda_id = v_c.id and u.status = 'ativo'), 0),
    'cancelados', coalesce((select jsonb_agg(jsonb_build_object('id', i.id,
      'produto', i.product_name, 'quantidade', i.quantity, 'subtotal', i.subtotal,
      'motivo', i.cancellation_reason, 'data', i.cancelled_at) order by i.cancelled_at, i.id)
      from public.pdv_cancelled_comanda_items i where i.comanda_id = v_c.id), '[]'::jsonb)
  );
end $$;

revoke all on function public.pdv_historico_comandas(uuid, date, date, text, integer, integer),
  public.pdv_historico_comanda_detalhe(uuid, uuid) from public, anon;
grant execute on function public.pdv_historico_comandas(uuid, date, date, text, integer, integer),
  public.pdv_historico_comanda_detalhe(uuid, uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
