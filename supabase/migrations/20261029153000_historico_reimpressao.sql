-- Reimpressão inclui somente a identificação pública da loja; nenhuma cobrança é alterada.
begin;
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
    'business', (select jsonb_build_object('name', s.business_name, 'cnpj', s.business_cnpj, 'address', s.business_address, 'phone', s.business_phone) from public.pdv_settings s where s.user_id=p_owner),
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

notify pgrst, 'reload schema';
commit;
