-- Contagem de estoque (inventário) com link público por setor.
--
-- O operador conta pelo celular, sem login: abre um link, digita a senha do
-- link e conta. O gestor acompanha em tempo real e, no fim, revisa as
-- divergências antes de qualquer coisa encostar no saldo.
--
-- Três decisões que estão no formato das tabelas:
--
--  * O saldo esperado é CONGELADO na abertura (`expected_qty`). O restaurante
--    continua vendendo durante a contagem; sem congelar, a divergência mistura
--    "sumiu" com "venderam enquanto eu contava" e o relatório não serve.
--
--  * Contagem CEGA por padrão: o operador não vê o esperado. Quando vê, a
--    tendência é confirmar o número da tela em vez de contar — e o inventário
--    deixa de achar justamente o que existe para achar.
--
--  * O ajuste NÃO sai automático. Fechar a contagem só marca; aplicar o ajuste
--    é um segundo passo, com o gestor olhando. Erro de digitação virando perda
--    contábil é o desfecho comum de inventário automático.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. A contagem
-- ---------------------------------------------------------------------------

create table if not exists public.pdv_stock_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,

  status text not null default 'aberta'
    check (status in ('aberta', 'fechada', 'aplicada', 'cancelada')),
  blind boolean not null default true,

  -- Escopo: nulo = todos os insumos.
  sectors text[],
  categories text[],

  opened_at timestamptz not null default now(),
  opened_by uuid,
  closed_at timestamptz,
  applied_at timestamptz,
  applied_by uuid,

  notes text,
  created_at timestamptz not null default now()
);

comment on column public.pdv_stock_counts.blind is
  'true = o operador não vê o saldo esperado. É o padrão, e é o que faz a contagem valer.';

create index if not exists idx_stock_counts_user
  on public.pdv_stock_counts (user_id, opened_at desc);

-- ---------------------------------------------------------------------------
-- 2. Os links — um por setor, cada um com sua senha
-- ---------------------------------------------------------------------------

create table if not exists public.pdv_stock_count_links (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.pdv_stock_counts(id) on delete cascade,
  user_id uuid not null,

  label text not null,                     -- "Cozinha", "Bar", "Estoque seco"
  token uuid not null default gen_random_uuid(),
  -- Hash bcrypt. A senha em claro nunca é gravada nem devolvida.
  password_hash text not null,
  sectors text[],                          -- nulo = o link vê todos os itens

  expires_at timestamptz not null,
  -- Freio de força bruta: o link é público e a senha é curta por natureza.
  failed_attempts int not null default 0,
  locked_until timestamptz,

  created_at timestamptz not null default now()
);

create unique index if not exists uq_stock_count_link_token
  on public.pdv_stock_count_links (token);

create index if not exists idx_stock_count_links_count
  on public.pdv_stock_count_links (count_id);

-- ---------------------------------------------------------------------------
-- 3. Os itens contados
-- ---------------------------------------------------------------------------

create table if not exists public.pdv_stock_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.pdv_stock_counts(id) on delete cascade,
  user_id uuid not null,
  ingredient_id uuid not null references public.pdv_ingredients(id) on delete cascade,

  -- Congelados na abertura, para o relatório ser interpretável depois.
  ingredient_name text not null,
  unit text not null,
  sector text,
  category text,
  expected_qty numeric not null default 0,
  unit_cost numeric not null default 0,

  -- Como o operador conta: "3 caixas de 5 kg e 2 kg soltos" vira 17 kg aqui.
  pack_size numeric,
  pack_label text,

  counted_qty numeric,
  counted_packs numeric,
  counted_loose numeric,
  counted_by text,
  counted_at timestamptz,
  notes text,

  created_at timestamptz not null default now()
);

create unique index if not exists uq_stock_count_item
  on public.pdv_stock_count_items (count_id, ingredient_id);

create index if not exists idx_stock_count_items_count
  on public.pdv_stock_count_items (count_id, sector);

-- ---------------------------------------------------------------------------
-- 4. Quem está contando agora
-- ---------------------------------------------------------------------------

create table if not exists public.pdv_stock_count_sessions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.pdv_stock_count_links(id) on delete cascade,
  count_id uuid not null references public.pdv_stock_counts(id) on delete cascade,
  user_id uuid not null,

  session_token uuid not null default gen_random_uuid(),
  counter_name text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists uq_stock_count_session_token
  on public.pdv_stock_count_sessions (session_token);

create index if not exists idx_stock_count_sessions_count
  on public.pdv_stock_count_sessions (count_id, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- 5. RLS — o painel do gestor lê; o operador só entra pelas funções
-- ---------------------------------------------------------------------------

alter table public.pdv_stock_counts enable row level security;
alter table public.pdv_stock_count_links enable row level security;
alter table public.pdv_stock_count_items enable row level security;
alter table public.pdv_stock_count_sessions enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'pdv_stock_counts', 'pdv_stock_count_links',
    'pdv_stock_count_items', 'pdv_stock_count_sessions'
  ] loop
    execute format('drop policy if exists "Establishment manages %1$s" on public.%1$s', t);
    execute format($f$
      create policy "Establishment manages %1$s" on public.%1$s
        for all
        using (auth.uid() = user_id or public.is_establishment_member(user_id))
        with check (auth.uid() = user_id or public.is_establishment_member(user_id))
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Abrir a contagem (gestor)
-- ---------------------------------------------------------------------------

-- `_links` é um array de {label, password, sectors[]}. Cada um vira um link com
-- sua própria senha, para o gestor dividir a contagem entre pessoas sem que uma
-- conte por cima da outra.
create or replace function public.pdv_stock_count_create(
  _name text,
  _links jsonb,
  _sectors text[] default null,
  _categories text[] default null,
  _blind boolean default true,
  _expires_hours int default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count_id uuid;
  v_link jsonb;
  v_itens int;
  v_saida jsonb := '[]'::jsonb;
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if _links is null or jsonb_array_length(_links) = 0 then
    raise exception 'links_required';
  end if;

  v_owner := public.pdv_resolve_owner(auth.uid());

  insert into public.pdv_stock_counts (user_id, name, blind, sectors, categories, opened_by)
  values (v_owner, _name, coalesce(_blind, true), _sectors, _categories, auth.uid())
  returning id into v_count_id;

  -- Congela o retrato do estoque. Daqui para a frente o que a venda fizer não
  -- contamina a divergência.
  insert into public.pdv_stock_count_items (
    count_id, user_id, ingredient_id, ingredient_name, unit, sector, category,
    expected_qty, unit_cost, pack_size
  )
  select
    v_count_id, v_owner, i.id, i.name, i.unit, i.sector, i.category,
    coalesce(i.current_stock, 0),
    coalesce(nullif(i.average_cost, 0), i.unit_cost, 0),
    nullif(i.purchase_lot, 0)
  from public.pdv_ingredients i
  where i.user_id = v_owner
    and (_sectors is null or i.sector = any(_sectors))
    and (_categories is null or i.category = any(_categories));

  get diagnostics v_itens = row_count;
  if v_itens = 0 then
    raise exception 'no_ingredients_in_scope';
  end if;

  for v_link in select * from jsonb_array_elements(_links) loop
    if coalesce(v_link->>'password', '') = '' then
      raise exception 'password_required';
    end if;

    insert into public.pdv_stock_count_links (
      count_id, user_id, label, password_hash, sectors, expires_at
    ) values (
      v_count_id, v_owner,
      coalesce(v_link->>'label', 'Contagem'),
      -- bcrypt: a senha em claro não fica em lugar nenhum.
      crypt(v_link->>'password', gen_salt('bf')),
      case
        when v_link->'sectors' is null or jsonb_typeof(v_link->'sectors') <> 'array' then null
        else array(select jsonb_array_elements_text(v_link->'sectors'))
      end,
      now() + make_interval(hours => greatest(1, coalesce(_expires_hours, 24)))
    )
    returning token into v_token;

    v_saida := v_saida || jsonb_build_object(
      'label', coalesce(v_link->>'label', 'Contagem'),
      'token', v_token
    );
  end loop;

  return jsonb_build_object('count_id', v_count_id, 'items', v_itens, 'links', v_saida);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Entrar pelo link (operador, sem login)
-- ---------------------------------------------------------------------------

create or replace function public.pdv_stock_count_open(
  _token uuid,
  _password text,
  _counter_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_count record;
  v_session uuid;
  v_itens jsonb;
begin
  select * into v_link from public.pdv_stock_count_links where token = _token;
  if not found then
    -- Mensagem única para token errado e senha errada: dizer qual dos dois
    -- falhou entrega ao atacante que o token existe.
    raise exception 'invalid_credentials';
  end if;

  if v_link.locked_until is not null and v_link.locked_until > now() then
    raise exception 'too_many_attempts';
  end if;
  if v_link.expires_at <= now() then
    raise exception 'link_expired';
  end if;

  if crypt(coalesce(_password, ''), v_link.password_hash) <> v_link.password_hash then
    update public.pdv_stock_count_links
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' end
     where id = v_link.id;
    raise exception 'invalid_credentials';
  end if;

  select * into v_count from public.pdv_stock_counts where id = v_link.count_id;
  if v_count.status <> 'aberta' then
    raise exception 'count_closed';
  end if;

  update public.pdv_stock_count_links
     set failed_attempts = 0, locked_until = null
   where id = v_link.id;

  insert into public.pdv_stock_count_sessions (link_id, count_id, user_id, counter_name)
  values (v_link.id, v_link.count_id, v_link.user_id, nullif(_counter_name, ''))
  returning session_token into v_session;

  -- Ordem da contagem: setor, depois nome. É o caminho que a pessoa faz na
  -- prateleira, não a ordem alfabética global.
  select coalesce(jsonb_agg(t order by t->>'sector' nulls last, t->>'name'), '[]'::jsonb)
    into v_itens
  from (
    select jsonb_build_object(
      'id', it.id,
      'name', it.ingredient_name,
      'unit', it.unit,
      'sector', it.sector,
      'category', it.category,
      'pack_size', it.pack_size,
      'counted_qty', it.counted_qty,
      'counted_packs', it.counted_packs,
      'counted_loose', it.counted_loose,
      'counted_by', it.counted_by,
      -- Só vai o esperado quando a contagem NÃO é cega.
      'expected_qty', case when v_count.blind then null else it.expected_qty end
    ) as t
    from public.pdv_stock_count_items it
    where it.count_id = v_link.count_id
      and (v_link.sectors is null or it.sector = any(v_link.sectors))
  ) s;

  return jsonb_build_object(
    'session_token', v_session,
    'count_name', v_count.name,
    'label', v_link.label,
    'blind', v_count.blind,
    'expires_at', v_link.expires_at,
    'items', v_itens
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Gravar a contagem de um item (operador)
-- ---------------------------------------------------------------------------

create or replace function public.pdv_stock_count_save(
  _session_token uuid,
  _item_id uuid,
  _packs numeric default null,
  _loose numeric default null,
  _qty numeric default null,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao record;
  v_item record;
  v_total numeric;
begin
  select s.*, c.status
    into v_sessao
    from public.pdv_stock_count_sessions s
    join public.pdv_stock_counts c on c.id = s.count_id
   where s.session_token = _session_token;
  if not found then
    raise exception 'invalid_session';
  end if;
  if v_sessao.status <> 'aberta' then
    raise exception 'count_closed';
  end if;

  select * into v_item
    from public.pdv_stock_count_items
   where id = _item_id and count_id = v_sessao.count_id;
  if not found then
    raise exception 'item_not_found';
  end if;

  -- Caixas × tamanho da embalagem + solto. É assim que a pessoa conta de
  -- verdade; a conta fica no servidor para não depender do navegador.
  if _qty is not null then
    v_total := _qty;
  else
    v_total := coalesce(_packs, 0) * coalesce(v_item.pack_size, 0) + coalesce(_loose, 0);
  end if;

  if v_total < 0 then
    raise exception 'negative_quantity';
  end if;

  update public.pdv_stock_count_items
     set counted_qty = round(v_total, 4),
         counted_packs = _packs,
         counted_loose = _loose,
         counted_by = coalesce(v_sessao.counter_name, counted_by),
         counted_at = now(),
         notes = coalesce(nullif(_notes, ''), notes)
   where id = _item_id;

  update public.pdv_stock_count_sessions
     set last_seen_at = now()
   where id = v_sessao.id;

  return jsonb_build_object('ok', true, 'counted_qty', round(v_total, 4));
end;
$$;

create or replace function public.pdv_stock_count_ping(_session_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pdv_stock_count_sessions
     set last_seen_at = now()
   where session_token = _session_token;
$$;

-- ---------------------------------------------------------------------------
-- 9. Aplicar os ajustes (gestor, segundo passo deliberado)
-- ---------------------------------------------------------------------------

create or replace function public.pdv_stock_count_apply(_count_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count record;
  v_item record;
  v_ajustes int := 0;
  v_valor numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  v_owner := public.pdv_resolve_owner(auth.uid());

  select * into v_count
    from public.pdv_stock_counts
   where id = _count_id and user_id = v_owner
   for update;
  if not found then
    raise exception 'count_not_found';
  end if;
  if v_count.status = 'aplicada' then
    raise exception 'already_applied';
  end if;

  for v_item in
    select * from public.pdv_stock_count_items
     where count_id = _count_id
       and counted_qty is not null
  loop
    -- O ajuste leva o saldo ATUAL para o contado. A divergência do relatório
    -- continua sendo contado − esperado (congelado): uma coisa é o que se
    -- analisa, outra é o que se corrige.
    declare
      v_atual numeric;
      v_delta numeric;
    begin
      select coalesce(current_stock, 0) into v_atual
        from public.pdv_ingredients where id = v_item.ingredient_id;

      v_delta := v_item.counted_qty - v_atual;
      if abs(v_delta) < 0.0001 then
        continue;
      end if;

      update public.pdv_ingredients
         set current_stock = v_item.counted_qty,
             current_balance = v_item.counted_qty,
             updated_at = now()
       where id = v_item.ingredient_id;

      insert into public.pdv_stock_movements
        (ingredient_id, type, quantity, unit_cost, reason, created_by)
      values
        (v_item.ingredient_id, 'ajuste', abs(v_delta), v_item.unit_cost,
         'Contagem de estoque: ' || v_count.name, auth.uid());

      v_ajustes := v_ajustes + 1;
      v_valor := v_valor + v_delta * v_item.unit_cost;
    end;
  end loop;

  update public.pdv_stock_counts
     set status = 'aplicada', applied_at = now(), applied_by = auth.uid(),
         closed_at = coalesce(closed_at, now())
   where id = _count_id;

  return jsonb_build_object('ajustes', v_ajustes, 'impacto_valor', round(v_valor, 2));
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Permissões
-- ---------------------------------------------------------------------------

-- O operador entra sem login: estas três precisam valer para `anon`.
grant execute on function public.pdv_stock_count_open(uuid, text, text) to anon, authenticated;
grant execute on function public.pdv_stock_count_save(uuid, uuid, numeric, numeric, numeric, text) to anon, authenticated;
grant execute on function public.pdv_stock_count_ping(uuid) to anon, authenticated;

grant execute on function public.pdv_stock_count_create(text, jsonb, text[], text[], boolean, int) to authenticated;
grant execute on function public.pdv_stock_count_apply(uuid) to authenticated;
