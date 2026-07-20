-- Recebimento de pedido por QR code público.
--
-- Um QR fixo é impresso e colado na doca. Quem recebe a mercadoria aponta o
-- celular, escolhe o pedido que chegou, confere item a item e confirma com a
-- senha de operador (a mesma de establishment_users usada na sangria). Sem app,
-- sem login — mas com assinatura de quem conferiu, que hoje não existe.
--
-- Segurança: o token NÃO dá acesso ao banco. Não há policy anônima em lugar
-- nenhum; o único caminho público é a edge function purchase-order-receipt,
-- que roda com service-role e resolve o tenant a partir do token.

-- ---------------------------------------------------------------------------
-- Token do QR
-- ---------------------------------------------------------------------------
create table if not exists public.pdv_receipt_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token uuid not null default gen_random_uuid(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists idx_prl_token on public.pdv_receipt_links(token);

-- Um único QR válido por estabelecimento: "gerar novo" revoga o anterior, que é
-- como se corta um papel que vazou.
create unique index if not exists idx_prl_active_per_user
  on public.pdv_receipt_links(user_id) where is_active;

alter table public.pdv_receipt_links enable row level security;

drop policy if exists "owner_all_prl" on public.pdv_receipt_links;
create policy "owner_all_prl" on public.pdv_receipt_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Auditoria: quem recebeu o quê, quando
-- ---------------------------------------------------------------------------
create table if not exists public.pdv_receipt_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  purchase_order_id uuid not null references public.pdv_purchase_orders(id) on delete cascade,
  -- Quem conferiu, resolvido pela senha em establishment_users.
  actor_name text,
  actor_user_id uuid,
  -- O que foi digitado, para reconstruir uma conferência contestada.
  payload jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pre_order on public.pdv_receipt_events(purchase_order_id);
create index if not exists idx_pre_user on public.pdv_receipt_events(user_id, created_at desc);

alter table public.pdv_receipt_events enable row level security;

drop policy if exists "owner_read_pre" on public.pdv_receipt_events;
create policy "owner_read_pre" on public.pdv_receipt_events
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Miolo do recebimento, compartilhado pelos dois canais
-- ---------------------------------------------------------------------------
-- A função original era security invoker e lia auth.uid(), então a página
-- pública não conseguia chamá-la. Em vez de reescrever entrada de estoque e
-- custo médio dentro da edge (duplicar cálculo de dinheiro é como isso apodrece),
-- o miolo vira este core e o RPC antigo passa a ser um wrapper fino.
--
-- security definer: passa por cima do RLS, portanto valida a posse na unha
-- (order.user_id e ingredient.user_id contra p_user_id). NÃO conceder execute
-- a authenticated/anon — quem chama com p_user_id arbitrário viraria qualquer
-- tenant. Só o wrapper (que injeta auth.uid()) e o service-role entram aqui.
--
-- p_channel:
--   'admin'  → tudo liberado (estorno, recebimento acima do pedido)
--   'public' → canal do QR: sem estorno e sem receber mais que o pedido
create or replace function public.pdv_receive_purchase_order_core(
  p_user_id uuid,
  p_order_id uuid,
  p_items jsonb,
  p_actor text default null,
  p_channel text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.pdv_purchase_orders%rowtype;
  v_item    public.pdv_purchase_order_items%rowtype;
  v_ing     public.pdv_ingredients%rowtype;
  v_entry   jsonb;
  v_qty     numeric;
  v_delta   numeric;
  v_new_stock numeric;
  v_new_avg   numeric;
  v_moved   int := 0;
  v_pending int;
  v_status  text;
  v_suffix  text := coalesce(' (' || nullif(trim(p_actor), '') || ')', '');
begin
  if p_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_channel not in ('admin', 'public') then
    raise exception 'Canal de recebimento inválido: %', p_channel;
  end if;

  select * into v_order
  from public.pdv_purchase_orders
  where id = p_order_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Pedido cancelado não pode ser recebido';
  end if;

  for v_entry in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_qty := coalesce((v_entry->>'quantity')::numeric, 0);
    if v_qty < 0 then
      raise exception 'Quantidade recebida não pode ser negativa';
    end if;

    select * into v_item
    from public.pdv_purchase_order_items
    where id = (v_entry->>'item_id')::uuid
      and purchase_order_id = p_order_id
    for update;

    if not found then
      raise exception 'Item % não pertence a este pedido', v_entry->>'item_id';
    end if;

    v_delta := v_qty - coalesce(v_item.quantity_received, 0);

    -- Guardas do canal público: mexer no estoque para baixo, ou dar entrada
    -- acima do pedido, só pelo admin com login.
    if p_channel = 'public' then
      if v_delta < 0 then
        raise exception 'Estorno não é permitido no recebimento por QR';
      end if;
      if v_qty > v_item.quantity then
        raise exception 'Recebimento acima do pedido não é permitido no QR';
      end if;
    end if;

    update public.pdv_purchase_order_items
    set quantity_received = v_qty
    where id = v_item.id;

    if v_delta = 0 then
      continue;
    end if;

    select * into v_ing
    from public.pdv_ingredients
    where id = v_item.ingredient_id and user_id = p_user_id
    for update;

    if not found then
      raise exception 'Insumo do item não encontrado';
    end if;

    v_new_stock := coalesce(v_ing.current_stock, 0) + v_delta;
    if v_new_stock < 0 then
      v_new_stock := 0;
    end if;

    -- Custo médio ponderado: só recalcula em entradas (delta > 0) e quando há
    -- saldo. Em estorno (delta < 0) o custo médio é preservado.
    if v_delta > 0 and v_new_stock > 0 then
      v_new_avg := (
        coalesce(v_ing.current_stock, 0) * coalesce(v_ing.average_cost, v_ing.unit_cost, 0)
        + v_delta * coalesce(v_item.unit_price, 0)
      ) / v_new_stock;
    else
      v_new_avg := coalesce(v_ing.average_cost, v_ing.unit_cost, 0);
    end if;

    update public.pdv_ingredients
    set current_stock  = v_new_stock,
        average_cost   = v_new_avg,
        current_balance = v_new_stock * v_new_avg,
        unit_cost      = case
                           when v_delta > 0 then coalesce(v_item.unit_price, v_ing.unit_cost)
                           else v_ing.unit_cost
                         end,
        updated_at     = now()
    where id = v_ing.id;

    -- pdv_stock_movements não tem user_id (a posse vem pelo ingrediente).
    -- created_by fica com o dono: no canal público não existe usuário logado,
    -- então quem conferiu vai identificado no reason.
    insert into public.pdv_stock_movements
      (ingredient_id, type, quantity, unit_cost, purchase_order_item_id, reason, created_by)
    values (
      v_ing.id,
      case when v_delta > 0 then 'entrada' else 'ajuste' end::public.pdv_stock_movement_type,
      abs(v_delta),
      v_item.unit_price,
      v_item.id,
      case
        when v_delta > 0 then 'Recebimento do pedido ' || v_order.order_number
        else 'Estorno de recebimento do pedido ' || v_order.order_number
      end || v_suffix,
      p_user_id
    );

    v_moved := v_moved + 1;
  end loop;

  -- Status do pedido: recebido só quando nenhum item ficou faltando.
  select count(*) into v_pending
  from public.pdv_purchase_order_items
  where purchase_order_id = p_order_id
    and coalesce(quantity_received, 0) < quantity;

  if v_pending = 0 then
    v_status := 'received';
  elsif exists (
    select 1 from public.pdv_purchase_order_items
    where purchase_order_id = p_order_id and coalesce(quantity_received, 0) > 0
  ) then
    v_status := 'partial';
  else
    v_status := v_order.status;
  end if;

  update public.pdv_purchase_orders
  set status = v_status,
      actual_delivery = case
                          when v_status = 'received' then current_date
                          else actual_delivery
                        end,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'status', v_status,
    'items_moved', v_moved,
    'items_pending', v_pending
  );
end;
$$;

revoke all on function public.pdv_receive_purchase_order_core(uuid, uuid, jsonb, text, text) from public;
revoke all on function public.pdv_receive_purchase_order_core(uuid, uuid, jsonb, text, text) from anon;
revoke all on function public.pdv_receive_purchase_order_core(uuid, uuid, jsonb, text, text) from authenticated;

-- ---------------------------------------------------------------------------
-- Canal admin: assinatura inalterada, agora só um wrapper sobre o core
-- ---------------------------------------------------------------------------
create or replace function public.pdv_receive_purchase_order(
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;
  return public.pdv_receive_purchase_order_core(v_user_id, p_order_id, p_items, null, 'admin');
end;
$$;

grant execute on function public.pdv_receive_purchase_order(uuid, jsonb) to authenticated;
