-- Delivery: a loja escolhe se aceita entrega e se aceita retirada no local.
--
-- Até aqui o checkout do cardápio online oferecia sempre as duas opções, sem
-- a loja poder desligar nenhuma. Padrão true nas duas: nada muda para quem
-- não mexer na configuração.

alter table public.delivery_settings
  add column if not exists accepts_delivery boolean not null default true,
  add column if not exists accepts_pickup boolean not null default true;

-- Desligar as duas deixaria o cardápio sem como fechar pedido.
alter table public.delivery_settings
  drop constraint if exists delivery_settings_alguma_forma_atendimento;
alter table public.delivery_settings
  add constraint delivery_settings_alguma_forma_atendimento
  check (accepts_delivery or accepts_pickup);

-- O pedido do cardápio online é gravado pelo próprio cliente, direto na
-- tabela. Esconder a opção na tela não basta: a trava fica aqui.
--
-- Só vale para o pedido do próprio cardápio feito por quem é de fora da loja.
-- Pedido lançado pela equipe (dono ou funcionário) e pedido de marketplace
-- (iFood, DeliveryMuch, que chegam pelo servidor) não passam por ela.
create or replace function public.delivery_orders_guard_order_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega boolean;
  v_retirada boolean;
begin
  if coalesce(new.source, 'own') <> 'own' then
    return new;
  end if;
  if auth.uid() is not null and public.pdv_resolve_owner(auth.uid()) = new.user_id then
    return new;
  end if;

  select accepts_delivery, accepts_pickup into v_entrega, v_retirada
    from delivery_settings where user_id = new.user_id;

  if new.order_type = 'pickup' and v_retirada is false then
    raise exception 'Este estabelecimento não está aceitando retirada no local.'
      using errcode = 'P0001';
  end if;
  if new.order_type = 'delivery' and v_entrega is false then
    raise exception 'Este estabelecimento não está fazendo entregas no momento. Escolha retirar no local.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_orders_guard_order_type on public.delivery_orders;
create trigger trg_delivery_orders_guard_order_type
  before insert on public.delivery_orders
  for each row execute function public.delivery_orders_guard_order_type();
