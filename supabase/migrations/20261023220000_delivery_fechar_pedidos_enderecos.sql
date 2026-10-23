-- Fecha pedidos, itens, adicionais e endereços do delivery (vazamento, 23/10/2026).
--
-- Regras `true` deixavam QUALQUER pessoa, mesmo sem login, com a chave pública
-- do app:
--   · ler todos os pedidos de todas as lojas (nome, telefone, endereço, valores);
--   · ler, criar, alterar e apagar endereços de qualquer cliente;
--   · ler e alterar itens e adicionais de qualquer pedido.
-- E as regras "da loja" usavam auth.uid() = user_id, que vale só para o DONO:
-- o caixa e o garçom (funcionários) enxergavam o delivery por causa da regra
-- aberta. Aqui a equipe passa a entrar por pdv_resolve_owner.
--
-- O cardápio online (cliente sem login) deixa de tocar nas tabelas e passa
-- pelas funções abaixo, que devolvem só o que a própria pessoa precisa.

-- ───────────────────────────── funções do cardápio

-- Cria o pedido inteiro numa transação (pedido, itens, adicionais, número).
-- Mesmo conteúdo que a tela gravava em quatro chamadas. O uso do cupom é
-- contado só pelo gatilho sync_coupon_usage_count: a tela somava de novo e o
-- cupom gastava em dobro.
create or replace function public.delivery_pedido_criar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja uuid := nullif(p->>'userId', '')::uuid;
  v_cliente uuid := nullif(p->>'customerId', '')::uuid;
  v_chave text := nullif(p->>'idempotencyKey', '');
  v_pedido delivery_orders;
  v_item jsonb;
  v_opcao jsonb;
  v_item_id uuid;
  v_ajuste numeric;
begin
  if v_loja is null or v_cliente is null then
    raise exception 'Pedido incompleto' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Pedido sem itens' using errcode = 'P0001';
  end if;
  if not exists (select 1 from delivery_customers where id = v_cliente) then
    raise exception 'Cliente não encontrado' using errcode = 'P0001';
  end if;

  -- Toque duplo ou reenvio: devolve o pedido que já existe.
  if v_chave is not null then
    select * into v_pedido from delivery_orders where user_id = v_loja and idempotency_key = v_chave;
    if found then
      return jsonb_build_object('id', v_pedido.id, 'order_number', v_pedido.order_number,
        'ticket_number', v_pedido.ticket_number, 'total', v_pedido.total,
        'status', v_pedido.status, 'created_at', v_pedido.created_at);
    end if;
  end if;

  begin
    insert into delivery_orders (
      order_number, user_id, customer_id, customer_name, customer_phone,
      delivery_address_id, delivery_address_text, order_type, status,
      subtotal, delivery_fee, discount, coupon_code, total,
      payment_method, payment_status, change_for, notes, estimated_time,
      idempotency_key, scheduled_for)
    values (
      'TMP-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || floor(random() * 1000)::int,
      v_loja, v_cliente, coalesce(p->>'customerName', ''), coalesce(p->>'customerPhone', ''),
      nullif(p->>'addressId', '')::uuid, nullif(p->>'addressText', ''),
      coalesce(nullif(p->>'orderType', ''), 'delivery'), 'pending',
      coalesce((p->>'subtotal')::numeric, 0), coalesce((p->>'deliveryFee')::numeric, 0),
      coalesce((p->>'discount')::numeric, 0), nullif(p->>'couponCode', ''),
      coalesce((p->>'total')::numeric, 0),
      coalesce(nullif(p->>'paymentMethod', ''), 'pix'), 'pending',
      nullif(p->>'changeFor', '')::numeric, nullif(p->>'notes', ''), 45,
      v_chave, nullif(p->>'scheduledFor', '')::timestamptz)
    returning * into v_pedido;
  exception when unique_violation then
    -- Corrida com outra chamada de mesma chave.
    select * into v_pedido from delivery_orders where user_id = v_loja and idempotency_key = v_chave;
    if not found then raise; end if;
    return jsonb_build_object('id', v_pedido.id, 'order_number', v_pedido.order_number,
      'ticket_number', v_pedido.ticket_number, 'total', v_pedido.total,
      'status', v_pedido.status, 'created_at', v_pedido.created_at);
  end;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    -- unit_price já inclui os adicionais (como a tela gravava): é o preço
    -- efetivo por unidade que vai para cupom, recibo e relatório.
    select coalesce(sum(coalesce((o->>'priceAdjustment')::numeric, 0) * coalesce((o->>'quantity')::numeric, 1)), 0)
      into v_ajuste
      from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb)) o;

    insert into delivery_order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, notes)
    values (v_pedido.id, nullif(v_item->>'productId', '')::uuid, coalesce(v_item->>'productName', 'Item'),
      coalesce((v_item->>'quantity')::numeric, 1),
      coalesce((v_item->>'unitPrice')::numeric, 0) + v_ajuste,
      coalesce((v_item->>'subtotal')::numeric, 0), nullif(v_item->>'notes', ''))
    returning id into v_item_id;

    for v_opcao in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb)) loop
      insert into delivery_order_item_options (order_item_id, option_name, item_name, option_item_id, price_adjustment, quantity)
      values (v_item_id, coalesce(v_opcao->>'optionName', ''), coalesce(v_opcao->>'itemName', ''),
        nullif(v_opcao->>'itemId', '')::uuid, coalesce((v_opcao->>'priceAdjustment')::numeric, 0),
        coalesce((v_opcao->>'quantity')::numeric, 1));
    end loop;
  end loop;

  -- Número sequencial: o gatilho numera quando há caixa aberto; senão, tenta aqui.
  if v_pedido.order_number like 'TMP-%' then
    begin
      perform delivery_assign_order_ticket(v_pedido.id);
    exception when others then
      null;
    end;
    select * into v_pedido from delivery_orders where id = v_pedido.id;
  end if;

  return jsonb_build_object('id', v_pedido.id, 'order_number', v_pedido.order_number,
    'ticket_number', v_pedido.ticket_number, 'total', v_pedido.total,
    'status', v_pedido.status, 'created_at', v_pedido.created_at);
end;
$$;

-- Acompanhamento do pedido pelo cliente. O id do pedido (uuid) é o que só o
-- próprio cliente tem; devolve status e valores, nunca nome, telefone ou endereço.
create or replace function public.delivery_pedido_acompanhar(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', id, 'order_number', order_number, 'status', status,
    'payment_method', payment_method, 'payment_status', payment_status,
    'change_for', change_for, 'total', total, 'cancellation_reason', cancellation_reason,
    'cashier_confirmed_at', cashier_confirmed_at,
    'customer_delivery_confirmed_at', customer_delivery_confirmed_at,
    'created_at', created_at, 'confirmed_at', confirmed_at, 'ready_at', ready_at,
    'delivered_at', delivered_at, 'cancelled_at', cancelled_at)
  from delivery_orders where id = p_order_id
$$;

create or replace function public.delivery_pedido_confirmar_recebimento(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update delivery_orders
     set customer_delivery_confirmed_at = now()
   where id = p_order_id and customer_delivery_confirmed_at is null;
  return public.delivery_pedido_acompanhar(p_order_id);
end;
$$;

-- Endereços. Quem tem conta vê todos os seus. Sem conta, só os que o próprio
-- aparelho salvou (ids guardados no navegador): listar pelo telefone mostraria
-- o endereço de qualquer pessoa para quem soubesse o número dela.
create or replace function public.delivery_enderecos_listar(p_customer_id uuid, p_ids uuid[] default '{}')
returns setof delivery_addresses
language sql
stable
security definer
set search_path = public
as $$
  select a.* from delivery_addresses a
   where a.customer_id = p_customer_id
     and (a.id = any (coalesce(p_ids, '{}'))
          or exists (select 1 from delivery_customers c
                      where c.id = p_customer_id and c.auth_user_id is not null
                        and c.auth_user_id = auth.uid()))
   order by a.is_default desc nulls last, a.created_at desc
$$;

create or replace function public.delivery_endereco_salvar(p_customer_id uuid, p jsonb)
returns delivery_addresses
language plpgsql
security definer
set search_path = public
as $$
declare
  v delivery_addresses;
begin
  if not exists (select 1 from delivery_customers where id = p_customer_id) then
    raise exception 'Cliente não encontrado' using errcode = 'P0001';
  end if;
  if coalesce((p->>'is_default')::boolean, false) then
    update delivery_addresses set is_default = false where customer_id = p_customer_id;
  end if;
  insert into delivery_addresses (customer_id, label, street, number, complement, neighborhood, city, state, zip_code, reference, is_default)
  values (p_customer_id, nullif(p->>'label', ''), coalesce(p->>'street', ''), coalesce(p->>'number', ''),
    nullif(p->>'complement', ''), coalesce(p->>'neighborhood', ''), coalesce(p->>'city', ''),
    coalesce(p->>'state', ''), nullif(p->>'zip_code', ''), nullif(p->>'reference', ''),
    coalesce((p->>'is_default')::boolean, false))
  returning * into v;
  return v;
end;
$$;

revoke all on function public.delivery_pedido_criar(jsonb) from public;
revoke all on function public.delivery_pedido_acompanhar(uuid) from public;
revoke all on function public.delivery_pedido_confirmar_recebimento(uuid) from public;
revoke all on function public.delivery_enderecos_listar(uuid, uuid[]) from public;
revoke all on function public.delivery_endereco_salvar(uuid, jsonb) from public;
grant execute on function public.delivery_pedido_criar(jsonb) to anon, authenticated;
grant execute on function public.delivery_pedido_acompanhar(uuid) to anon, authenticated;
grant execute on function public.delivery_pedido_confirmar_recebimento(uuid) to anon, authenticated;
grant execute on function public.delivery_enderecos_listar(uuid, uuid[]) to anon, authenticated;
grant execute on function public.delivery_endereco_salvar(uuid, jsonb) to anon, authenticated;
