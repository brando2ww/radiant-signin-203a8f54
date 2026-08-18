-- Prêmio de fidelidade em forma de desconto, e o resgate com estado.
--
-- Duas mudanças que andam juntas:
--
-- 1. O prêmio deixa de ser só "um produto" e passa a ter tipo: entrega um
--    produto do cardápio ou abate um valor no carrinho.
--
-- 2. O resgate deixa de ser um evento e passa a ser um registro com estado.
--    Hoje `redeem_loyalty_prize` debita os pontos no clique — quem abandona o
--    carrinho perde os pontos e não leva nada. Com produto isso já era ruim;
--    com desconto é insustentável, porque sem pedido o desconto nem chega a
--    existir. Agora o resgate RESERVA, e o ponto só sai quando o pedido é
--    confirmado.
--
-- O dinheiro continua entrando pela mesma porta de sempre:
-- `delivery_orders.discount`. É a coluna que o fechamento de caixa, a DRE, o
-- demonstrativo do dia, o relatório de descontos e o `valor_desconto` da NFC-e
-- já leem. O que faltava era saber DE ONDE o desconto veio — daí
-- `discount_source`.
--
-- Escopo: delivery. O salão (pdv_orders) não aceita resgate de desconto.

-- ---------------------------------------------------------------------------
-- 1. O prêmio ganha tipo
-- ---------------------------------------------------------------------------

alter table public.delivery_loyalty_prizes
  add column if not exists kind text not null default 'product',
  add column if not exists discount_type text,
  add column if not exists discount_value numeric,
  add column if not exists discount_max numeric,
  add column if not exists min_order_value numeric not null default 0;

comment on column public.delivery_loyalty_prizes.kind is
  'product = entrega um item do cardápio a R$ 0,00; discount = abate valor no carrinho.';
comment on column public.delivery_loyalty_prizes.discount_max is
  'Teto em reais do desconto percentual. Nulo = sem teto.';
comment on column public.delivery_loyalty_prizes.min_order_value is
  'Subtotal mínimo para o prêmio valer. Conferido de novo na aplicação, no servidor.';

alter table public.delivery_loyalty_prizes
  drop constraint if exists delivery_loyalty_prizes_kind_check;
alter table public.delivery_loyalty_prizes
  add constraint delivery_loyalty_prizes_kind_check
  check (kind in ('product', 'discount'));

-- Prêmio de desconto sem tipo ou sem valor é um prêmio que não paga nada.
alter table public.delivery_loyalty_prizes
  drop constraint if exists delivery_loyalty_prizes_discount_check;
alter table public.delivery_loyalty_prizes
  add constraint delivery_loyalty_prizes_discount_check
  check (
    kind <> 'discount' or (
      discount_type in ('fixed', 'percentage')
      and discount_value is not null
      and discount_value > 0
      and (discount_type <> 'percentage' or discount_value <= 100)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. O pedido ganha procedência do desconto
-- ---------------------------------------------------------------------------

alter table public.delivery_orders
  add column if not exists discount_source text,
  add column if not exists loyalty_redemption_id uuid,
  add column if not exists loyalty_points_spent integer;

alter table public.delivery_orders
  drop constraint if exists delivery_orders_discount_source_check;
alter table public.delivery_orders
  add constraint delivery_orders_discount_source_check
  check (discount_source is null or discount_source in ('coupon', 'loyalty_prize', 'manual'));

comment on column public.delivery_orders.discount_source is
  'De onde veio o desconto. Nulo = pedido sem desconto (ou anterior a esta coluna).';

-- Retroativo: o histórico sabia distinguir cupom de desconto na mão pelo
-- coupon_code. Sem esse backfill, todo pedido antigo apareceria como "sem
-- origem" nos relatórios que passam a quebrar por procedência.
update public.delivery_orders
   set discount_source = case when coupon_code is not null then 'coupon' else 'manual' end
 where discount > 0 and discount_source is null;

create index if not exists idx_delivery_orders_discount_source
  on public.delivery_orders (user_id, discount_source, created_at desc)
  where discount > 0;

-- ---------------------------------------------------------------------------
-- 3. Pontos podem voltar
-- ---------------------------------------------------------------------------

-- Pedido cancelado devolve o ponto, e devolver não é 'earn' (não veio de
-- compra, não expira pelas mesmas regras) nem 'redeem' (o sinal é o contrário).
alter table public.delivery_loyalty_points
  drop constraint if exists delivery_loyalty_points_type_check;
alter table public.delivery_loyalty_points
  add constraint delivery_loyalty_points_type_check
  check (type in ('earn', 'redeem', 'refund'));

-- ---------------------------------------------------------------------------
-- 4. O resgate vira registro
-- ---------------------------------------------------------------------------

create table if not exists public.delivery_loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  customer_id uuid not null references public.delivery_customers(id) on delete cascade,
  prize_id uuid not null references public.delivery_loyalty_prizes(id) on delete restrict,

  -- Congelado na reserva. Se o lojista editar o prêmio enquanto o cliente
  -- fecha o pedido, vale o que foi prometido na tela.
  kind text not null check (kind in ('product', 'discount')),
  prize_name text not null,
  points_cost integer not null check (points_cost > 0),
  delivery_product_id uuid references public.delivery_products(id) on delete set null,
  discount_type text,
  discount_value numeric,
  discount_max numeric,
  min_order_value numeric not null default 0,

  -- Preenchido na aplicação, com o subtotal real do pedido.
  discount_amount numeric,

  status text not null default 'reserved'
    check (status in ('reserved', 'applied', 'cancelled', 'expired')),
  order_id uuid references public.delivery_orders(id) on delete set null,

  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  applied_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.delivery_loyalty_redemptions is
  'Resgates de fidelidade com estado. reserved não moveu ponto nenhum; applied é o que virou pedido.';

-- Um resgate por vez, por cliente. É a mesma regra que o carrinho já aplicava
-- no navegador, agora onde ela não pode ser burlada.
create unique index if not exists uq_loyalty_redemption_reserved
  on public.delivery_loyalty_redemptions (user_id, customer_id)
  where status = 'reserved';

create index if not exists idx_loyalty_redemptions_customer
  on public.delivery_loyalty_redemptions (user_id, customer_id, created_at desc);

create index if not exists idx_loyalty_redemptions_order
  on public.delivery_loyalty_redemptions (order_id)
  where order_id is not null;

alter table public.delivery_loyalty_redemptions enable row level security;

-- Leitura. Escrita é só pelas funções SECURITY DEFINER abaixo: nenhuma policy
-- de INSERT/UPDATE, de propósito.
drop policy if exists "Customer can view own redemptions" on public.delivery_loyalty_redemptions;
create policy "Customer can view own redemptions"
  on public.delivery_loyalty_redemptions for select
  using (customer_id = public.loyalty_current_customer());

drop policy if exists "Owner can view redemptions" on public.delivery_loyalty_redemptions;
create policy "Owner can view redemptions"
  on public.delivery_loyalty_redemptions for select
  using (auth.uid() = user_id);

drop policy if exists "Staff can view redemptions" on public.delivery_loyalty_redemptions;
create policy "Staff can view redemptions"
  on public.delivery_loyalty_redemptions for select
  using (public.is_establishment_member(user_id));

-- ---------------------------------------------------------------------------
-- 5. Saldo passa a descontar o que está reservado
-- ---------------------------------------------------------------------------

-- Sem isto o cliente reserva um prêmio de 500 pontos, continua vendo 500 no
-- saldo e tenta reservar outro.
create or replace function public.loyalty_get_balance(_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_balance int;
  v_expiring int;
  v_reserved int;
begin
  if auth.uid() is null then
    return jsonb_build_object('balance', 0, 'expiring_soon', 0, 'authenticated', false);
  end if;

  v_customer := public.loyalty_current_customer();
  if v_customer is null then
    return jsonb_build_object('balance', 0, 'expiring_soon', 0, 'authenticated', true, 'linked', false);
  end if;

  select coalesce(sum(points), 0) into v_balance
  from public.delivery_loyalty_points
  where user_id = _user_id and customer_id = v_customer;

  select coalesce(sum(points), 0) into v_expiring
  from public.delivery_loyalty_points
  where user_id = _user_id
    and customer_id = v_customer
    and type = 'earn'
    and expires_at is not null
    and expires_at <= now() + interval '30 days'
    and expires_at > now();

  -- Reserva vencida não segura ponto: o filtro por expires_at dispensa
  -- qualquer rotina de limpeza para efeito de saldo.
  select coalesce(sum(points_cost), 0) into v_reserved
  from public.delivery_loyalty_redemptions
  where user_id = _user_id
    and customer_id = v_customer
    and status = 'reserved'
    and expires_at > now();

  return jsonb_build_object(
    'balance', v_balance - v_reserved,
    'total_points', v_balance,
    'reserved', v_reserved,
    'expiring_soon', v_expiring,
    'authenticated', true,
    'linked', true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Reservar
-- ---------------------------------------------------------------------------

create or replace function public.loyalty_reserve_prize(_user_id uuid, _prize_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_balance int;
  v_reserved int;
  v_in_use int;
  v_prize record;
  v_row public.delivery_loyalty_redemptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  v_customer := public.loyalty_current_customer();
  if v_customer is null then
    raise exception 'customer_not_linked';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_customer::text));

  -- Devolve ao estoque o que venceu, antes de conferir disponibilidade.
  update public.delivery_loyalty_redemptions
     set status = 'expired'
   where user_id = _user_id
     and customer_id = v_customer
     and status = 'reserved'
     and expires_at <= now();

  if exists (
    select 1 from public.delivery_loyalty_redemptions
     where user_id = _user_id and customer_id = v_customer and status = 'reserved'
  ) then
    raise exception 'redemption_already_reserved';
  end if;

  select * into v_prize
    from public.delivery_loyalty_prizes
   where id = _prize_id and user_id = _user_id and is_active = true;
  if not found then
    raise exception 'prize_not_available';
  end if;

  -- Estoque conta o que já saiu e o que está reservado por qualquer cliente:
  -- senão o último prêmio é prometido duas vezes.
  if v_prize.max_quantity is not null then
    select count(*) into v_in_use
      from public.delivery_loyalty_redemptions
     where prize_id = _prize_id and status = 'reserved' and expires_at > now();
    if coalesce(v_prize.redeemed_count, 0) + v_in_use >= v_prize.max_quantity then
      raise exception 'prize_out_of_stock';
    end if;
  end if;

  select coalesce(sum(points), 0) into v_balance
    from public.delivery_loyalty_points
   where user_id = _user_id and customer_id = v_customer;

  select coalesce(sum(points_cost), 0) into v_reserved
    from public.delivery_loyalty_redemptions
   where user_id = _user_id and customer_id = v_customer
     and status = 'reserved' and expires_at > now();

  if (v_balance - v_reserved) < v_prize.points_cost then
    raise exception 'insufficient_points';
  end if;

  insert into public.delivery_loyalty_redemptions (
    user_id, customer_id, prize_id, kind, prize_name, points_cost,
    delivery_product_id, discount_type, discount_value, discount_max, min_order_value,
    expires_at
  ) values (
    _user_id, v_customer, _prize_id, coalesce(v_prize.kind, 'product'), v_prize.name, v_prize.points_cost,
    v_prize.delivery_product_id, v_prize.discount_type, v_prize.discount_value,
    v_prize.discount_max, coalesce(v_prize.min_order_value, 0),
    now() + interval '2 hours'
  )
  returning * into v_row;

  return jsonb_build_object(
    'redemption_id', v_row.id,
    'kind', v_row.kind,
    'prize_name', v_row.prize_name,
    'points_cost', v_row.points_cost,
    'delivery_product_id', v_row.delivery_product_id,
    'discount_type', v_row.discount_type,
    'discount_value', v_row.discount_value,
    'discount_max', v_row.discount_max,
    'min_order_value', v_row.min_order_value,
    'expires_at', v_row.expires_at,
    'new_balance', v_balance - v_reserved - v_prize.points_cost
  );
end;
$$;

-- Compatibilidade: aba antiga do navegador ainda chama isto. Redireciona para
-- a reserva em vez de queimar o ponto na hora.
create or replace function public.redeem_loyalty_prize(_user_id uuid, _prize_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.loyalty_reserve_prize(_user_id, _prize_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Consultar e cancelar a reserva
-- ---------------------------------------------------------------------------

-- O carrinho lê daqui, não do localStorage: quem limpa o navegador ou troca de
-- aparelho não pode perder o prêmio nem duplicá-lo.
create or replace function public.loyalty_active_reservation(_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_row public.delivery_loyalty_redemptions%rowtype;
begin
  if auth.uid() is null then
    return 'null'::jsonb;
  end if;

  v_customer := public.loyalty_current_customer();
  if v_customer is null then
    return 'null'::jsonb;
  end if;

  update public.delivery_loyalty_redemptions
     set status = 'expired'
   where user_id = _user_id and customer_id = v_customer
     and status = 'reserved' and expires_at <= now();

  select * into v_row
    from public.delivery_loyalty_redemptions
   where user_id = _user_id and customer_id = v_customer and status = 'reserved'
   limit 1;

  if not found then
    return 'null'::jsonb;
  end if;

  return jsonb_build_object(
    'redemption_id', v_row.id,
    'prize_id', v_row.prize_id,
    'kind', v_row.kind,
    'prize_name', v_row.prize_name,
    'points_cost', v_row.points_cost,
    'delivery_product_id', v_row.delivery_product_id,
    'discount_type', v_row.discount_type,
    'discount_value', v_row.discount_value,
    'discount_max', v_row.discount_max,
    'min_order_value', v_row.min_order_value,
    'expires_at', v_row.expires_at
  );
end;
$$;

create or replace function public.loyalty_cancel_reservation(_user_id uuid, _redemption_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  v_customer := public.loyalty_current_customer();
  if v_customer is null then
    raise exception 'customer_not_linked';
  end if;

  update public.delivery_loyalty_redemptions
     set status = 'cancelled', cancelled_at = now()
   where id = _redemption_id
     and user_id = _user_id
     and customer_id = v_customer
     and status = 'reserved';
  get diagnostics v_count = row_count;

  return jsonb_build_object('cancelled', v_count > 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Aplicar no pedido — onde o ponto finalmente sai
-- ---------------------------------------------------------------------------

create or replace function public.delivery_apply_redemption(
  _user_id uuid, _order_id uuid, _redemption_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_order record;
  v_red record;
  v_subtotal numeric;
  v_amount numeric := 0;
  v_balance int;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  v_customer := public.loyalty_current_customer();
  if v_customer is null then
    raise exception 'customer_not_linked';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_customer::text));

  select * into v_red
    from public.delivery_loyalty_redemptions
   where id = _redemption_id and user_id = _user_id and customer_id = v_customer
   for update;
  if not found then
    raise exception 'redemption_not_found';
  end if;

  -- Reenvio do checkout (retry de rede, duplo submit) não pode cobrar o ponto
  -- duas vezes.
  if v_red.status = 'applied' and v_red.order_id = _order_id then
    return jsonb_build_object(
      'already_applied', true,
      'discount_amount', coalesce(v_red.discount_amount, 0),
      'points_spent', v_red.points_cost
    );
  end if;

  if v_red.status <> 'reserved' then
    raise exception 'redemption_not_reserved';
  end if;

  if v_red.expires_at <= now() then
    update public.delivery_loyalty_redemptions set status = 'expired' where id = _redemption_id;
    raise exception 'redemption_expired';
  end if;

  select * into v_order
    from public.delivery_orders
   where id = _order_id and user_id = _user_id and customer_id = v_customer
   for update;
  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'order_cancelled';
  end if;

  if v_order.loyalty_redemption_id is not null
     and v_order.loyalty_redemption_id <> _redemption_id then
    raise exception 'order_already_has_redemption';
  end if;

  -- Prêmio e cupom não se somam. Empilhar os dois é o caminho curto para o
  -- pedido de graça, e ninguém confere isso no navegador.
  if v_order.coupon_code is not null then
    raise exception 'coupon_conflict';
  end if;

  -- Subtotal recalculado a partir dos itens gravados. O valor que o navegador
  -- mandou não serve de base para conceder desconto.
  select coalesce(sum(subtotal), 0) into v_subtotal
    from public.delivery_order_items
   where order_id = _order_id;

  if v_subtotal < coalesce(v_red.min_order_value, 0) then
    raise exception 'below_minimum_order';
  end if;

  if v_red.kind = 'discount' then
    if v_red.discount_type = 'percentage' then
      v_amount := v_subtotal * coalesce(v_red.discount_value, 0) / 100;
      if v_red.discount_max is not null and v_amount > v_red.discount_max then
        v_amount := v_red.discount_max;
      end if;
    else
      v_amount := coalesce(v_red.discount_value, 0);
    end if;
    if v_amount > v_subtotal then
      v_amount := v_subtotal;
    end if;
    v_amount := round(greatest(v_amount, 0), 2);
  else
    -- Prêmio de produto já entra no pedido como item a R$ 0,00.
    v_amount := 0;
  end if;

  update public.delivery_orders
     set subtotal = v_subtotal,
         discount = v_amount,
         discount_source = 'loyalty_prize',
         loyalty_redemption_id = _redemption_id,
         loyalty_points_spent = v_red.points_cost,
         total = greatest(0, v_subtotal + coalesce(delivery_fee, 0) - v_amount)
   where id = _order_id;

  -- Aqui, e só aqui, o ponto sai.
  insert into public.delivery_loyalty_points
    (user_id, customer_id, points, type, reference_id, description)
  values
    (_user_id, v_customer, -v_red.points_cost, 'redeem',
     _redemption_id::text, 'Resgate: ' || v_red.prize_name)
  on conflict do nothing;

  update public.delivery_loyalty_prizes
     set redeemed_count = coalesce(redeemed_count, 0) + 1
   where id = v_red.prize_id;

  update public.delivery_loyalty_redemptions
     set status = 'applied', order_id = _order_id, applied_at = now(), discount_amount = v_amount
   where id = _redemption_id;

  select coalesce(sum(points), 0) into v_balance
    from public.delivery_loyalty_points
   where user_id = _user_id and customer_id = v_customer;

  return jsonb_build_object(
    'already_applied', false,
    'discount_amount', v_amount,
    'points_spent', v_red.points_cost,
    'new_balance', v_balance,
    'order_total', greatest(0, v_subtotal + coalesce(v_order.delivery_fee, 0) - v_amount)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Cancelou o pedido, volta o ponto
-- ---------------------------------------------------------------------------

-- Trigger, e não chamada explícita, porque o pedido é cancelado por vários
-- caminhos (painel, cozinha, expiração) e nenhum deles sabe de fidelidade.
create or replace function public.loyalty_refund_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_red record;
begin
  for v_red in
    select * from public.delivery_loyalty_redemptions
     where order_id = new.id and status = 'applied'
  loop
    insert into public.delivery_loyalty_points
      (user_id, customer_id, points, type, reference_id, description)
    values
      (v_red.user_id, v_red.customer_id, v_red.points_cost, 'refund',
       v_red.id::text, 'Estorno do resgate: ' || v_red.prize_name)
    on conflict do nothing;

    update public.delivery_loyalty_redemptions
       set status = 'cancelled', cancelled_at = now()
     where id = v_red.id;

    update public.delivery_loyalty_prizes
       set redeemed_count = greatest(0, coalesce(redeemed_count, 0) - 1)
     where id = v_red.prize_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_loyalty_refund_on_cancel on public.delivery_orders;
create trigger trg_loyalty_refund_on_cancel
  after update on public.delivery_orders
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.loyalty_refund_on_order_cancel();

-- ---------------------------------------------------------------------------
-- 10. Permissões
-- ---------------------------------------------------------------------------

grant execute on function public.loyalty_reserve_prize(uuid, uuid) to authenticated;
grant execute on function public.loyalty_cancel_reservation(uuid, uuid) to authenticated;
grant execute on function public.loyalty_active_reservation(uuid) to authenticated;
grant execute on function public.delivery_apply_redemption(uuid, uuid, uuid) to authenticated;
grant execute on function public.redeem_loyalty_prize(uuid, uuid) to authenticated;
grant execute on function public.loyalty_get_balance(uuid) to anon, authenticated;
