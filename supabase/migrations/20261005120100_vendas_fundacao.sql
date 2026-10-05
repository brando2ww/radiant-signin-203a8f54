-- Velara · Força de vendas · fundação do banco (05/10/2026, pedido do dono).
--
-- Representantes que vendem para clientes B2B do estabelecimento: carteira de clientes, catálogo com imagem e preço de
-- representante, proposta em PDF com a marca do estabelecimento que vira pedido, contas a receber geradas do pedido,
-- cobrança pelo Asaas do próprio estabelecimento, comissão sobre o que foi recebido e agenda de visitas.
--
-- Decisões do dono (05/10):
--   · cobrança = Asaas de cada empresa (cada estabelecimento conecta a própria conta; chave no cofre);
--   · comissão = percentual por representante sobre o que o cliente PAGOU (nasce quando a parcela é baixada);
--   · o representante vê só os clientes da carteira dele, e só as propostas, pedidos e agenda dele;
--   · pedido NÃO baixa estoque por enquanto.
--
-- Acesso: módulo "vendas" liberado por empresa (tenant_modules), conferido no banco em toda política. Dono, gerente e
-- financeiro veem tudo; o representante só o que é dele; os demais papéis não entram no módulo.
-- Convenção do Velara: user_id = dono do estabelecimento (a chave da empresa) em toda tabela.

-- ── Módulo e quem é quem ───────────────────────────────────────────────────
create or replace function public.vendas_tem_modulo(_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenants t join public.tenant_modules tm on tm.tenant_id = t.id
     where t.owner_user_id = _owner and tm.module = 'vendas' and tm.is_active
       and (tm.expires_at is null or tm.expires_at > now()))
$$;

create or replace function public.vendas_e_representante()
returns boolean language sql stable security definer set search_path = public as $$
  select public.pdv_user_role(auth.uid()) = 'representante'::public.app_role
$$;

-- Dono, gerente ou financeiro do estabelecimento, com o módulo liberado: vê e mexe em tudo do módulo.
create or replace function public.vendas_gestor(_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.vendas_tem_modulo(_owner)
     and (auth.uid() = _owner
          or (public.is_establishment_member(_owner)
              and public.pdv_user_role(auth.uid()) in ('gerente'::public.app_role, 'financeiro'::public.app_role)))
$$;

-- ── Representantes ─────────────────────────────────────────────────────────
create table public.vendas_representantes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  rep_user_id           uuid unique references auth.users (id) on delete set null,
  name                  text not null check (char_length(btrim(name)) between 2 and 120),
  email                 text,
  phone                 text,
  document              text,
  region                text,
  commission_percent    numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  max_discount_percent  numeric(5,2) not null default 0 check (max_discount_percent between 0 and 100),
  notes                 text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index vendas_representantes_owner on public.vendas_representantes (user_id);

-- Representante de quem está logado (null para quem não é representante).
create or replace function public.vendas_rep_id()
returns uuid language sql stable security definer set search_path = public as $$
  select r.id from public.vendas_representantes r where r.rep_user_id = auth.uid() and r.is_active limit 1
$$;

-- Representante pode ver/mexer na linha: módulo liberado, é da equipe, é representante e a linha é dele.
create or replace function public.vendas_da_carteira(_owner uuid, _rep uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _rep is not null and public.vendas_tem_modulo(_owner) and public.is_establishment_member(_owner)
     and public.vendas_e_representante() and _rep = public.vendas_rep_id()
$$;

alter table public.vendas_representantes enable row level security;
create policy "Gestão vê e cadastra representantes" on public.vendas_representantes for all
  using (public.vendas_gestor(user_id)) with check (public.vendas_gestor(user_id));
create policy "Representante vê o próprio cadastro" on public.vendas_representantes for select
  using (rep_user_id = auth.uid() and public.vendas_tem_modulo(user_id));

-- ── Clientes B2B (mesmo cadastro de clientes do PDV, com os campos de empresa) ──
alter table public.pdv_customers
  add column if not exists person_type          text check (person_type in ('PF', 'PJ')),
  add column if not exists cnpj                 text,
  add column if not exists company_name         text,
  add column if not exists trade_name           text,
  add column if not exists state_registration   text,
  add column if not exists contact_name         text,
  add column if not exists whatsapp             text,
  add column if not exists cep                  text,
  add column if not exists street               text,
  add column if not exists address_number       text,
  add column if not exists complement           text,
  add column if not exists district             text,
  add column if not exists city                 text,
  add column if not exists state                text,
  add column if not exists ibge_code            text,
  add column if not exists representative_id    uuid references public.vendas_representantes (id) on delete set null,
  add column if not exists payment_terms        text,
  add column if not exists credit_limit         numeric(12,2),
  add column if not exists is_b2b               boolean not null default false,
  add column if not exists asaas_customer_id    text;
create index if not exists pdv_customers_representative on public.pdv_customers (representative_id) where representative_id is not null;

-- Antes só o dono via os clientes (a equipe recebia lista vazia). Agora: dono e equipe veem tudo, menos o
-- representante, que só vê e cadastra clientes da carteira dele.
drop policy if exists "Gestão de clientes PDV" on public.pdv_customers;
create policy "Dono e equipe gerenciam clientes" on public.pdv_customers for all
  using (auth.uid() = user_id or (public.is_establishment_member(user_id) and not public.vendas_e_representante()))
  with check (auth.uid() = user_id or (public.is_establishment_member(user_id) and not public.vendas_e_representante()));
create policy "Representante gerencia a própria carteira" on public.pdv_customers for all
  using (public.vendas_da_carteira(user_id, representative_id))
  with check (public.vendas_da_carteira(user_id, representative_id));

-- Cliente cadastrado pelo representante entra na carteira dele (e como cliente B2B).
create or replace function public.vendas_cliente_novo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.vendas_e_representante() then
    new.representative_id := public.vendas_rep_id();
    new.is_b2b := true;
  end if;
  return new;
end $$;
create trigger vendas_cliente_novo before insert on public.pdv_customers for each row execute function public.vendas_cliente_novo();

-- ── Catálogo: preço de representante e regras de venda no produto ──────────
alter table public.pdv_products
  add column if not exists b2b_enabled   boolean not null default false,
  add column if not exists price_b2b     numeric(12,2) check (price_b2b >= 0),
  add column if not exists sku           text,
  add column if not exists sales_unit    text,
  add column if not exists min_qty       numeric(12,3) check (min_qty > 0),
  add column if not exists pack_qty      numeric(12,3) check (pack_qty > 0),
  add column if not exists gallery       jsonb not null default '[]'::jsonb;
-- (leitura pela equipe já existe: "Staff can view products"; quem cadastra continua sendo o dono)

-- ── Numeração (ORC-2026-0001, PED-2026-0001) ───────────────────────────────
create table public.vendas_numeracao (
  user_id  uuid not null,
  kind     text not null check (kind in ('ORC', 'PED')),
  year     integer not null,
  last     integer not null default 0,
  primary key (user_id, kind, year)
);
alter table public.vendas_numeracao enable row level security;

create or replace function public.vendas_proximo_numero(_owner uuid, _kind text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_year integer := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer; v_n integer;
begin
  insert into public.vendas_numeracao (user_id, kind, year, last) values (_owner, _kind, v_year, 1)
  on conflict (user_id, kind, year) do update set last = vendas_numeracao.last + 1
  returning last into v_n;
  return _kind || '-' || v_year || '-' || lpad(v_n::text, 4, '0');
end $$;
revoke all on function public.vendas_proximo_numero(uuid, text) from public, anon, authenticated;

-- ── Propostas ──────────────────────────────────────────────────────────────
create table public.vendas_propostas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  number             text not null,
  representative_id  uuid references public.vendas_representantes (id) on delete set null,
  customer_id        uuid not null references public.pdv_customers (id) on delete restrict,
  status             text not null default 'draft'
                     check (status in ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted', 'cancelled')),
  valid_until        date,
  payment_method     text check (payment_method in ('boleto', 'pix', 'cartao', 'transferencia', 'dinheiro', 'a_combinar')),
  installments       integer not null default 1 check (installments between 1 and 24),
  first_due_days     integer not null default 0 check (first_due_days between 0 and 365),
  interval_days      integer not null default 30 check (interval_days between 1 and 365),
  payment_terms      text,
  delivery_date      date,
  delivery_terms     text,
  notes              text,
  internal_notes     text,
  subtotal           numeric(12,2) not null default 0,
  discount_amount    numeric(12,2) not null default 0 check (discount_amount >= 0),
  shipping_amount    numeric(12,2) not null default 0 check (shipping_amount >= 0),
  total              numeric(12,2) not null default 0,
  public_token       text not null unique default encode(gen_random_bytes(18), 'hex'),
  sent_at            timestamptz,
  viewed_at          timestamptz,
  responded_at       timestamptz,
  responder_name     text,
  rejection_reason   text,
  order_id           uuid,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, number)
);
create index vendas_propostas_owner on public.vendas_propostas (user_id, created_at desc);
create index vendas_propostas_rep on public.vendas_propostas (representative_id);

create table public.vendas_proposta_itens (
  id                uuid primary key default gen_random_uuid(),
  proposta_id       uuid not null references public.vendas_propostas (id) on delete cascade,
  user_id           uuid not null,
  position          integer not null default 0,
  product_id        uuid references public.pdv_products (id) on delete set null,
  description       text not null,
  image_url         text,
  unit              text,
  quantity          numeric(12,3) not null check (quantity > 0),
  unit_price        numeric(12,2) not null check (unit_price >= 0),
  discount_percent  numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  total             numeric(12,2) not null default 0
);
create index vendas_proposta_itens_proposta on public.vendas_proposta_itens (proposta_id, position);

-- ── Pedidos de venda ───────────────────────────────────────────────────────
create table public.vendas_pedidos (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  number              text not null,
  proposta_id         uuid references public.vendas_propostas (id) on delete set null,
  representative_id   uuid references public.vendas_representantes (id) on delete set null,
  commission_percent  numeric(5,2) not null default 0,
  customer_id         uuid not null references public.pdv_customers (id) on delete restrict,
  status              text not null default 'confirmed' check (status in ('confirmed', 'invoiced', 'delivered', 'cancelled')),
  payment_method      text,
  installments        integer not null default 1,
  first_due_days      integer not null default 0,
  interval_days       integer not null default 30,
  payment_terms       text,
  delivery_date       date,
  delivery_terms      text,
  notes               text,
  internal_notes      text,
  subtotal            numeric(12,2) not null default 0,
  discount_amount     numeric(12,2) not null default 0,
  shipping_amount     numeric(12,2) not null default 0,
  total               numeric(12,2) not null default 0,
  public_token        text not null unique default encode(gen_random_bytes(18), 'hex'),
  confirmed_at        timestamptz not null default now(),
  invoiced_at         timestamptz,
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, number)
);
create index vendas_pedidos_owner on public.vendas_pedidos (user_id, created_at desc);
create index vendas_pedidos_rep on public.vendas_pedidos (representative_id);
alter table public.vendas_propostas add constraint vendas_propostas_order_fk foreign key (order_id) references public.vendas_pedidos (id) on delete set null;

create table public.vendas_pedido_itens (
  id                uuid primary key default gen_random_uuid(),
  pedido_id         uuid not null references public.vendas_pedidos (id) on delete cascade,
  user_id           uuid not null,
  position          integer not null default 0,
  product_id        uuid references public.pdv_products (id) on delete set null,
  description       text not null,
  image_url         text,
  unit              text,
  quantity          numeric(12,3) not null check (quantity > 0),
  unit_price        numeric(12,2) not null check (unit_price >= 0),
  discount_percent  numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  total             numeric(12,2) not null default 0
);
create index vendas_pedido_itens_pedido on public.vendas_pedido_itens (pedido_id, position);

-- Total do item e da proposta/pedido sempre recalculados no banco (a tela não decide o valor que vai para o cliente).
create or replace function public.vendas_item_total()
returns trigger language plpgsql as $$
begin
  new.total := round(new.quantity * new.unit_price * (1 - new.discount_percent / 100), 2);
  return new;
end $$;
create trigger vendas_proposta_itens_total before insert or update on public.vendas_proposta_itens for each row execute function public.vendas_item_total();
create trigger vendas_pedido_itens_total before insert or update on public.vendas_pedido_itens for each row execute function public.vendas_item_total();

create or replace function public.vendas_recalcular_proposta(_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.vendas_propostas p
     set subtotal = coalesce((select sum(i.total) from public.vendas_proposta_itens i where i.proposta_id = p.id), 0),
         total = greatest(0, coalesce((select sum(i.total) from public.vendas_proposta_itens i where i.proposta_id = p.id), 0)
                             - p.discount_amount + p.shipping_amount),
         updated_at = now()
   where p.id = _id
$$;
create or replace function public.vendas_itens_mudaram()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.vendas_recalcular_proposta(coalesce(new.proposta_id, old.proposta_id));
  return null;
end $$;
create trigger vendas_proposta_itens_recalc after insert or update or delete on public.vendas_proposta_itens
  for each row execute function public.vendas_itens_mudaram();
create or replace function public.vendas_proposta_totais()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.discount_amount is distinct from old.discount_amount or new.shipping_amount is distinct from old.shipping_amount) then
    new.total := greatest(0, new.subtotal - new.discount_amount + new.shipping_amount);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger vendas_propostas_totais before update on public.vendas_propostas for each row execute function public.vendas_proposta_totais();

-- Numeração e dono preenchidos pelo banco na criação; o representante sempre cria em nome dele.
create or replace function public.vendas_proposta_nova()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := coalesce(new.user_id, public.pdv_resolve_owner(auth.uid()));
  if public.vendas_e_representante() then
    new.representative_id := public.vendas_rep_id();
    -- O vínculo com o cliente não passa pelas regras de acesso: a carteira é conferida aqui.
    if not exists (select 1 from public.pdv_customers c where c.id = new.customer_id and c.representative_id = new.representative_id) then
      raise exception 'Este cliente não está na sua carteira.' using errcode = '42501';
    end if;
  end if;
  if new.representative_id is null then
    new.representative_id := (select c.representative_id from public.pdv_customers c where c.id = new.customer_id);
  end if;
  new.number := public.vendas_proximo_numero(new.user_id, 'ORC');
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
create trigger vendas_propostas_nova before insert on public.vendas_propostas for each row execute function public.vendas_proposta_nova();

create or replace function public.vendas_item_dono()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'vendas_proposta_itens' then
    new.user_id := (select p.user_id from public.vendas_propostas p where p.id = new.proposta_id);
  else
    new.user_id := (select p.user_id from public.vendas_pedidos p where p.id = new.pedido_id);
  end if;
  return new;
end $$;
create trigger vendas_proposta_itens_dono before insert on public.vendas_proposta_itens for each row execute function public.vendas_item_dono();
create trigger vendas_pedido_itens_dono before insert on public.vendas_pedido_itens for each row execute function public.vendas_item_dono();

alter table public.vendas_propostas enable row level security;
alter table public.vendas_proposta_itens enable row level security;
alter table public.vendas_pedidos enable row level security;
alter table public.vendas_pedido_itens enable row level security;
create policy "Gestão" on public.vendas_propostas for all using (public.vendas_gestor(user_id)) with check (public.vendas_gestor(user_id));
create policy "Representante: as dele" on public.vendas_propostas for all
  using (public.vendas_da_carteira(user_id, representative_id)) with check (public.vendas_da_carteira(user_id, representative_id));
create policy "Itens seguem a proposta" on public.vendas_proposta_itens for all
  using (exists (select 1 from public.vendas_propostas p where p.id = proposta_id))
  with check (exists (select 1 from public.vendas_propostas p where p.id = proposta_id and p.status in ('draft', 'sent')));
create policy "Gestão" on public.vendas_pedidos for all using (public.vendas_gestor(user_id)) with check (public.vendas_gestor(user_id));
create policy "Representante: os dele (só leitura)" on public.vendas_pedidos for select using (public.vendas_da_carteira(user_id, representative_id));
create policy "Itens seguem o pedido" on public.vendas_pedido_itens for select
  using (exists (select 1 from public.vendas_pedidos p where p.id = pedido_id));
create policy "Gestão mexe nos itens do pedido" on public.vendas_pedido_itens for all
  using (exists (select 1 from public.vendas_pedidos p where p.id = pedido_id and public.vendas_gestor(p.user_id)))
  with check (exists (select 1 from public.vendas_pedidos p where p.id = pedido_id and public.vendas_gestor(p.user_id)));

-- ── Contas a receber do pedido, cobrança e comissão (no financeiro que já existe) ──
alter table public.pdv_financial_transactions
  add column if not exists vendas_pedido_id   uuid references public.vendas_pedidos (id) on delete set null,
  add column if not exists representative_id  uuid references public.vendas_representantes (id) on delete set null,
  add column if not exists asaas_payment_id   text,
  add column if not exists asaas_status       text,
  add column if not exists charge_url         text,
  add column if not exists bank_slip_url      text,
  add column if not exists pix_payload        text,
  add column if not exists charged_at         timestamptz;
create index if not exists pdv_fin_vendas_pedido on public.pdv_financial_transactions (vendas_pedido_id) where vendas_pedido_id is not null;
create unique index if not exists pdv_fin_asaas_payment on public.pdv_financial_transactions (asaas_payment_id) where asaas_payment_id is not null;
-- Gerente e financeiro passam a ver o financeiro da empresa (antes só o dono via; a equipe recebia lista vazia).
create policy "Gerente e financeiro da empresa" on public.pdv_financial_transactions for all
  using (public.is_establishment_member(user_id) and public.pdv_user_role(auth.uid()) in ('gerente'::public.app_role, 'financeiro'::public.app_role))
  with check (public.is_establishment_member(user_id) and public.pdv_user_role(auth.uid()) in ('gerente'::public.app_role, 'financeiro'::public.app_role));

create table public.vendas_comissoes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  representative_id  uuid not null references public.vendas_representantes (id) on delete cascade,
  pedido_id          uuid references public.vendas_pedidos (id) on delete set null,
  transaction_id     uuid not null unique references public.pdv_financial_transactions (id) on delete cascade,
  base_amount        numeric(12,2) not null,
  percent            numeric(5,2) not null,
  amount             numeric(12,2) not null,
  status             text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  received_at        date,
  paid_at            timestamptz,
  payable_id         uuid references public.pdv_financial_transactions (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index vendas_comissoes_rep on public.vendas_comissoes (representative_id, received_at desc);
alter table public.vendas_comissoes enable row level security;
create policy "Gestão" on public.vendas_comissoes for all using (public.vendas_gestor(user_id)) with check (public.vendas_gestor(user_id));
create policy "Representante vê as dele" on public.vendas_comissoes for select using (public.vendas_da_carteira(user_id, representative_id));

-- A parcela do pedido foi recebida: nasce a comissão (sobre o valor recebido). Voltou a pendente/cancelada: a comissão
-- que ainda não foi paga ao representante é cancelada.
create or replace function public.vendas_comissao_no_recebimento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pedido public.vendas_pedidos;
begin
  if new.vendas_pedido_id is null or new.transaction_type <> 'receivable' then return null; end if;
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select * into v_pedido from public.vendas_pedidos p where p.id = new.vendas_pedido_id;
    if v_pedido.representative_id is not null and v_pedido.commission_percent > 0 then
      insert into public.vendas_comissoes (user_id, representative_id, pedido_id, transaction_id, base_amount, percent, amount, received_at)
      values (new.user_id, v_pedido.representative_id, v_pedido.id, new.id, new.amount, v_pedido.commission_percent,
              round(new.amount * v_pedido.commission_percent / 100, 2), coalesce(new.payment_date, current_date))
      on conflict (transaction_id) do update
         set status = case when vendas_comissoes.status = 'cancelled' then 'pending' else vendas_comissoes.status end,
             base_amount = excluded.base_amount, amount = excluded.amount, received_at = excluded.received_at;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'paid' and new.status <> 'paid' then
    update public.vendas_comissoes c set status = 'cancelled' where c.transaction_id = new.id and c.status = 'pending';
  end if;
  return null;
end $$;
create trigger vendas_comissao after insert or update of status on public.pdv_financial_transactions
  for each row execute function public.vendas_comissao_no_recebimento();

-- ── Conversão: proposta aprovada vira pedido e gera as contas a receber ─────
create or replace function public.vendas_gerar_pedido(_proposta uuid, _responder text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  p public.vendas_propostas;
  v_pedido uuid;
  v_number text;
  v_group uuid := gen_random_uuid();
  v_parcela numeric(12,2);
  v_resto numeric(12,2);
  v_rep_percent numeric(5,2);
  i integer;
begin
  select * into p from public.vendas_propostas x where x.id = _proposta for update;
  if p.id is null then raise exception 'Proposta não encontrada.' using errcode = 'P0001'; end if;
  if p.order_id is not null then return p.order_id; end if;
  if p.status not in ('draft', 'sent', 'approved') then
    raise exception 'Esta proposta não pode mais virar pedido (situação: %).', p.status using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.vendas_proposta_itens it where it.proposta_id = p.id) then
    raise exception 'A proposta não tem itens.' using errcode = 'P0001';
  end if;
  select r.commission_percent into v_rep_percent from public.vendas_representantes r where r.id = p.representative_id;
  v_number := public.vendas_proximo_numero(p.user_id, 'PED');
  insert into public.vendas_pedidos (user_id, number, proposta_id, representative_id, commission_percent, customer_id, payment_method,
                                     installments, first_due_days, interval_days, payment_terms, delivery_date, delivery_terms, notes,
                                     internal_notes, subtotal, discount_amount, shipping_amount, total, created_by)
  values (p.user_id, v_number, p.id, p.representative_id, coalesce(v_rep_percent, 0), p.customer_id, p.payment_method,
          p.installments, p.first_due_days, p.interval_days, p.payment_terms, p.delivery_date, p.delivery_terms, p.notes,
          p.internal_notes, p.subtotal, p.discount_amount, p.shipping_amount, p.total, coalesce(auth.uid(), p.created_by))
  returning id into v_pedido;
  insert into public.vendas_pedido_itens (pedido_id, position, product_id, description, image_url, unit, quantity, unit_price, discount_percent)
  select v_pedido, it.position, it.product_id, it.description, it.image_url, it.unit, it.quantity, it.unit_price, it.discount_percent
    from public.vendas_proposta_itens it where it.proposta_id = p.id order by it.position;

  -- Parcelas no contas a receber (a última leva o arredondamento).
  if p.total > 0 then
    v_parcela := round(p.total / p.installments, 2);
    v_resto := p.total - v_parcela * (p.installments - 1);
    for i in 1..p.installments loop
      insert into public.pdv_financial_transactions (user_id, transaction_type, amount, due_date, status, description, customer_id,
                                                     payment_method, document_number, group_id, installment_number, installment_total,
                                                     competence_date, vendas_pedido_id, representative_id)
      values (p.user_id, 'receivable', case when i = p.installments then v_resto else v_parcela end,
              current_date + p.first_due_days + (i - 1) * p.interval_days, 'pending',
              'Pedido ' || v_number || case when p.installments > 1 then ' · parcela ' || i || '/' || p.installments else '' end,
              p.customer_id, p.payment_method, v_number, v_group, i, p.installments, current_date, v_pedido, p.representative_id);
    end loop;
  end if;

  update public.vendas_propostas x
     set status = 'converted', order_id = v_pedido, responded_at = coalesce(x.responded_at, now()),
         responder_name = coalesce(x.responder_name, _responder)
   where x.id = p.id;
  return v_pedido;
end $$;
revoke all on function public.vendas_gerar_pedido(uuid, text) from public, anon, authenticated;

-- Pela tela (dono, gestor ou o representante da proposta): "o cliente aprovou por telefone, virar pedido".
create or replace function public.vendas_converter_proposta(p_proposta uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare p public.vendas_propostas;
begin
  select * into p from public.vendas_propostas x where x.id = p_proposta;
  if p.id is null or not (public.vendas_gestor(p.user_id) or public.vendas_da_carteira(p.user_id, p.representative_id)) then
    raise exception 'Proposta não encontrada.' using errcode = 'P0001';
  end if;
  return public.vendas_gerar_pedido(p.id, null);
end $$;
grant execute on function public.vendas_converter_proposta(uuid) to authenticated;

-- Cancelar o pedido: as parcelas ainda não recebidas são canceladas (a cobrança no Asaas é cancelada pela tela).
create or replace function public.vendas_cancelar_pedido(p_pedido uuid, p_motivo text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v public.vendas_pedidos;
begin
  select * into v from public.vendas_pedidos x where x.id = p_pedido for update;
  if v.id is null or not public.vendas_gestor(v.user_id) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v.status = 'cancelled' then return; end if;
  update public.vendas_pedidos x set status = 'cancelled', cancelled_at = now(), cancel_reason = left(nullif(btrim(p_motivo), ''), 300), updated_at = now()
   where x.id = v.id;
  update public.pdv_financial_transactions t set status = 'cancelled', updated_at = now()
   where t.vendas_pedido_id = v.id and t.status in ('pending', 'overdue');
end $$;
grant execute on function public.vendas_cancelar_pedido(uuid, text) to authenticated;

-- ── Página pública da proposta (sem login, pelo token) ─────────────────────
create or replace function public.vendas_proposta_publica(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.vendas_propostas;
begin
  select * into p from public.vendas_propostas x where x.public_token = p_token and x.status <> 'draft';
  if p.id is null then return null; end if;
  if p.viewed_at is null then update public.vendas_propostas x set viewed_at = now() where x.id = p.id; end if;
  if p.status = 'sent' and p.valid_until is not null and p.valid_until < (now() at time zone 'America/Sao_Paulo')::date then
    update public.vendas_propostas x set status = 'expired' where x.id = p.id;
    p.status := 'expired';
  end if;
  return jsonb_build_object(
    'proposta', jsonb_build_object('number', p.number, 'status', p.status, 'valid_until', p.valid_until, 'payment_method', p.payment_method,
      'installments', p.installments, 'first_due_days', p.first_due_days, 'interval_days', p.interval_days, 'payment_terms', p.payment_terms,
      'delivery_date', p.delivery_date, 'delivery_terms', p.delivery_terms, 'notes', p.notes, 'subtotal', p.subtotal,
      'discount_amount', p.discount_amount, 'shipping_amount', p.shipping_amount, 'total', p.total, 'created_at', p.created_at,
      'responded_at', p.responded_at, 'responder_name', p.responder_name, 'order_number', (select o.number from public.vendas_pedidos o where o.id = p.order_id)),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'image_url', i.image_url, 'unit', i.unit,
      'quantity', i.quantity, 'unit_price', i.unit_price, 'discount_percent', i.discount_percent, 'total', i.total) order by i.position)
      from public.vendas_proposta_itens i where i.proposta_id = p.id), '[]'),
    'cliente', (select jsonb_build_object('name', coalesce(c.trade_name, c.name), 'company_name', c.company_name,
      'document', coalesce(c.cnpj, c.cpf)) from public.pdv_customers c where c.id = p.customer_id),
    'representante', (select jsonb_build_object('name', r.name, 'phone', r.phone, 'email', r.email) from public.vendas_representantes r where r.id = p.representative_id),
    'marca', (select jsonb_build_object('name', coalesce(b.business_name, s.business_name), 'logo_url', b.logo_url, 'primary_color', b.primary_color,
      'secondary_color', b.secondary_color, 'cnpj', s.business_cnpj, 'phone', s.business_phone, 'address', s.business_address)
      from (select 1) one left join public.business_settings b on b.user_id = p.user_id left join public.pdv_settings s on s.user_id = p.user_id));
end $$;
grant execute on function public.vendas_proposta_publica(text) to anon, authenticated;

create or replace function public.vendas_proposta_responder(p_token text, p_aprovar boolean, p_nome text, p_motivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.vendas_propostas; v_pedido uuid;
begin
  select * into p from public.vendas_propostas x where x.public_token = p_token for update;
  if p.id is null or p.status not in ('sent') then
    raise exception 'Esta proposta não está aberta para resposta.' using errcode = 'P0001';
  end if;
  if p.valid_until is not null and p.valid_until < (now() at time zone 'America/Sao_Paulo')::date then
    update public.vendas_propostas x set status = 'expired' where x.id = p.id;
    raise exception 'Esta proposta venceu. Fale com o representante para receber uma nova.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null then
    raise exception 'Informe o seu nome.' using errcode = 'P0001';
  end if;
  if p_aprovar then
    update public.vendas_propostas x set status = 'approved', responded_at = now(), responder_name = left(btrim(p_nome), 120) where x.id = p.id;
    v_pedido := public.vendas_gerar_pedido(p.id, left(btrim(p_nome), 120));
    return jsonb_build_object('status', 'approved', 'order_number', (select o.number from public.vendas_pedidos o where o.id = v_pedido));
  end if;
  update public.vendas_propostas x set status = 'rejected', responded_at = now(), responder_name = left(btrim(p_nome), 120),
         rejection_reason = left(nullif(btrim(coalesce(p_motivo, '')), ''), 500)
   where x.id = p.id;
  return jsonb_build_object('status', 'rejected');
end $$;
grant execute on function public.vendas_proposta_responder(text, boolean, text, text) to anon, authenticated;

-- ── Agenda ─────────────────────────────────────────────────────────────────
create table public.vendas_agenda (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  representative_id  uuid references public.vendas_representantes (id) on delete cascade,
  customer_id        uuid references public.pdv_customers (id) on delete set null,
  proposta_id        uuid references public.vendas_propostas (id) on delete set null,
  kind               text not null default 'visita' check (kind in ('visita', 'ligacao', 'reuniao', 'entrega', 'tarefa', 'outro')),
  title              text not null check (char_length(btrim(title)) between 1 and 160),
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  all_day            boolean not null default false,
  location           text,
  notes              text,
  status             text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  outcome            text,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index vendas_agenda_owner on public.vendas_agenda (user_id, starts_at);
create index vendas_agenda_rep on public.vendas_agenda (representative_id, starts_at);
create or replace function public.vendas_agenda_nova()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := coalesce(new.user_id, public.pdv_resolve_owner(auth.uid()));
  if public.vendas_e_representante() then
    new.representative_id := public.vendas_rep_id();
    if new.customer_id is not null
       and not exists (select 1 from public.pdv_customers c where c.id = new.customer_id and c.representative_id = new.representative_id) then
      raise exception 'Este cliente não está na sua carteira.' using errcode = '42501';
    end if;
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
create trigger vendas_agenda_nova before insert on public.vendas_agenda for each row execute function public.vendas_agenda_nova();
alter table public.vendas_agenda enable row level security;
create policy "Gestão" on public.vendas_agenda for all using (public.vendas_gestor(user_id)) with check (public.vendas_gestor(user_id));
create policy "Representante: a dele" on public.vendas_agenda for all
  using (public.vendas_da_carteira(user_id, representative_id)) with check (public.vendas_da_carteira(user_id, representative_id));

-- ── Asaas do estabelecimento (cobrança) ────────────────────────────────────
create table public.vendas_asaas (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  environment         text not null default 'production' check (environment in ('production', 'sandbox')),
  api_key_secret_id   uuid,
  key_hint            text,
  webhook_token       text not null default encode(gen_random_bytes(24), 'hex'),
  webhook_id          text,
  account_name        text,
  account_document    text,
  wallet_id           text,
  status              text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  last_error          text,
  connected_at        timestamptz,
  updated_at          timestamptz not null default now()
);
alter table public.vendas_asaas enable row level security;
create policy "Gestão vê a conexão" on public.vendas_asaas for select using (public.vendas_gestor(user_id));
-- (a chave nunca sai para a tela: gravar e ler a chave é só pelas functions do servidor, com a chave de serviço)

create or replace function public.vendas_asaas_gravar(_owner uuid, _key text, _environment text, _account jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_secret uuid;
begin
  insert into public.vendas_asaas (user_id) values (_owner) on conflict (user_id) do nothing;
  select a.api_key_secret_id into v_secret from public.vendas_asaas a where a.user_id = _owner for update;
  if v_secret is null then
    v_secret := vault.create_secret(_key, 'vendas_asaas_' || _owner::text, 'Chave do Asaas do estabelecimento (Força de vendas)');
  else
    perform vault.update_secret(v_secret, _key);
  end if;
  update public.vendas_asaas a
     set api_key_secret_id = v_secret, key_hint = right(_key, 4), environment = _environment, status = 'connected', last_error = null,
         account_name = _account ->> 'name', account_document = _account ->> 'document', wallet_id = _account ->> 'wallet_id',
         connected_at = now(), updated_at = now()
   where a.user_id = _owner;
end $$;
create or replace function public.vendas_asaas_chave(_owner uuid)
returns text language sql stable security definer set search_path = public as $$
  select s.decrypted_secret from public.vendas_asaas a join vault.decrypted_secrets s on s.id = a.api_key_secret_id
   where a.user_id = _owner and a.status = 'connected'
$$;
revoke all on function public.vendas_asaas_gravar(uuid, text, text, jsonb), public.vendas_asaas_chave(uuid) from public, anon, authenticated;
grant execute on function public.vendas_asaas_gravar(uuid, text, text, jsonb), public.vendas_asaas_chave(uuid) to service_role;

-- ── Atualizado em ──────────────────────────────────────────────────────────
create or replace function public.vendas_touch()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger vendas_representantes_touch before update on public.vendas_representantes for each row execute function public.vendas_touch();
create trigger vendas_pedidos_touch before update on public.vendas_pedidos for each row execute function public.vendas_touch();
create trigger vendas_agenda_touch before update on public.vendas_agenda for each row execute function public.vendas_touch();

grant select, insert, update, delete on public.vendas_representantes, public.vendas_propostas, public.vendas_proposta_itens,
  public.vendas_pedidos, public.vendas_pedido_itens, public.vendas_comissoes, public.vendas_agenda to authenticated;
grant select on public.vendas_asaas to authenticated;
grant all on public.vendas_representantes, public.vendas_propostas, public.vendas_proposta_itens, public.vendas_pedidos,
  public.vendas_pedido_itens, public.vendas_comissoes, public.vendas_agenda, public.vendas_asaas, public.vendas_numeracao to service_role;

notify pgrst, 'reload schema';
