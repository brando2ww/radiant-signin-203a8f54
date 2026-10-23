-- VAZAMENTO (23/10/2026): a tela de Clientes do PDV listava os clientes do
-- delivery de TODAS as lojas. O dono do Restaurante Sertão Adentro, recém
-- chegado, via 1000 clientes de outras lojas (nome, telefone).
--
-- delivery_customers é um cadastro GLOBAL (o mesmo telefone pede em várias
-- lojas) e não tem coluna de loja; a consulta da tela não filtrava, e a regra
-- de acesso "Clientes podem ver seus próprios dados" era `true` para todos.
--
-- Esta migration cria a ligação cliente ↔ loja. Quem é cliente de uma loja é
-- quem pediu nela, juntou pontos de fidelidade ou resgatou prêmio nela.

create table if not exists public.delivery_clientes_loja (
  user_id uuid not null,
  customer_id uuid not null references public.delivery_customers(id) on delete cascade,
  desde timestamptz not null default now(),
  primary key (user_id, customer_id)
);

create index if not exists delivery_clientes_loja_customer_idx
  on public.delivery_clientes_loja (customer_id);

alter table public.delivery_clientes_loja enable row level security;

-- Dono e equipe veem os vínculos da própria loja.
drop policy if exists delivery_clientes_loja_equipe_select on public.delivery_clientes_loja;
create policy delivery_clientes_loja_equipe_select
  on public.delivery_clientes_loja for select to authenticated
  using (user_id = (select public.pdv_resolve_owner(auth.uid())));

-- Histórico.
insert into public.delivery_clientes_loja (user_id, customer_id, desde)
select user_id, customer_id, min(created_at)
  from public.delivery_orders
 where customer_id is not null
 group by 1, 2
on conflict do nothing;

insert into public.delivery_clientes_loja (user_id, customer_id)
select distinct user_id, customer_id from public.delivery_loyalty_points
 where customer_id is not null and user_id is not null
on conflict do nothing;

insert into public.delivery_clientes_loja (user_id, customer_id)
select distinct user_id, customer_id from public.delivery_loyalty_redemptions
 where customer_id is not null and user_id is not null
on conflict do nothing;

-- Daqui para frente: todo pedido liga o cliente à loja.
create or replace function public.delivery_clientes_loja_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null then
    insert into delivery_clientes_loja (user_id, customer_id)
    values (new.user_id, new.customer_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_clientes_loja_do_pedido on public.delivery_orders;
create trigger trg_delivery_clientes_loja_do_pedido
  after insert or update of customer_id on public.delivery_orders
  for each row execute function public.delivery_clientes_loja_do_pedido();

drop trigger if exists trg_delivery_clientes_loja_da_fidelidade on public.delivery_loyalty_points;
create trigger trg_delivery_clientes_loja_da_fidelidade
  after insert on public.delivery_loyalty_points
  for each row execute function public.delivery_clientes_loja_do_pedido();
