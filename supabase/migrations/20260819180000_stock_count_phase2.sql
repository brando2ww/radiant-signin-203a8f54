-- Contagem de estoque, fase 2: código de barras e ordem de prateleira.
--
-- Duas coisas que mudam o tempo de contagem, não a funcionalidade:
--
--  * O código de barras precisa viajar junto do item da contagem. O EAN já
--    existe no insumo, mas o item da contagem é um retrato congelado — se ele
--    não levar o EAN, o leitor não tem contra o que casar sem consultar a
--    tabela de insumos, que o operador anônimo não pode ler.
--
--  * A lista precisa seguir o caminho físico do depósito, não o alfabeto.
--    Ordem alfabética faz a pessoa atravessar a sala a cada item.

-- ---------------------------------------------------------------------------
-- 1. Ordem de contagem no cadastro do insumo
-- ---------------------------------------------------------------------------

alter table public.pdv_ingredients
  add column if not exists count_order int;

comment on column public.pdv_ingredients.count_order is
  'Posição do insumo no caminho físico da contagem, dentro do setor. Nulo vai para o fim, em ordem alfabética.';

create index if not exists idx_ingredients_count_order
  on public.pdv_ingredients (user_id, sector, count_order);

-- ---------------------------------------------------------------------------
-- 2. O item da contagem carrega o que o operador precisa
-- ---------------------------------------------------------------------------

alter table public.pdv_stock_count_items
  add column if not exists ean text,
  add column if not exists sort_order int;

create index if not exists idx_stock_count_items_ean
  on public.pdv_stock_count_items (count_id, ean)
  where ean is not null;

-- ---------------------------------------------------------------------------
-- 3. A abertura passa a congelar EAN e ordem
-- ---------------------------------------------------------------------------

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

  insert into public.pdv_stock_count_items (
    count_id, user_id, ingredient_id, ingredient_name, unit, sector, category,
    expected_qty, unit_cost, pack_size, ean, sort_order
  )
  select
    v_count_id, v_owner, i.id, i.name, i.unit, i.sector, i.category,
    coalesce(i.current_stock, 0),
    coalesce(nullif(i.average_cost, 0), i.unit_cost, 0),
    nullif(i.purchase_lot, 0),
    nullif(i.ean, ''),
    i.count_order
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
-- 4. A entrada do operador devolve o EAN e respeita a ordem de prateleira
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

  -- Setor, depois a ordem de prateleira, e só então o nome. É o caminho que a
  -- pessoa faz de fato; alfabético faz atravessar a sala a cada item.
  select coalesce(
           jsonb_agg(t order by ordem_setor, ordem_item nulls last, nome),
           '[]'::jsonb)
    into v_itens
  from (
    select
      it.sector as ordem_setor,
      it.sort_order as ordem_item,
      it.ingredient_name as nome,
      jsonb_build_object(
        'id', it.id,
        'name', it.ingredient_name,
        'unit', it.unit,
        'sector', it.sector,
        'category', it.category,
        'pack_size', it.pack_size,
        'ean', it.ean,
        'counted_qty', it.counted_qty,
        'counted_packs', it.counted_packs,
        'counted_loose', it.counted_loose,
        'counted_by', it.counted_by,
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
-- 5. Acuracidade por contagem, para comparar uma com a outra
-- ---------------------------------------------------------------------------

-- Acuracidade aqui é a taxa de itens que bateram entre os CONTADOS. Medir
-- sobre o total puniria a contagem parcial duas vezes — o que ficou de fora
-- aparece à parte, como cobertura.
create or replace function public.pdv_stock_count_history(_limit int default 12)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_saida jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  v_owner := public.pdv_resolve_owner(auth.uid());

  select coalesce(jsonb_agg(t order by opened_at desc), '[]'::jsonb)
    into v_saida
  from (
    select
      c.id, c.name, c.status, c.opened_at,
      count(i.*) as total,
      count(i.counted_qty) as contados,
      count(*) filter (
        where i.counted_qty is not null
          and abs(i.counted_qty - i.expected_qty) <= 0.0001
      ) as exatos,
      coalesce(sum(
        case when i.counted_qty is not null
             then (i.counted_qty - i.expected_qty) * i.unit_cost end
      ), 0) as impacto,
      coalesce(sum(
        case when i.counted_qty is not null
             then abs(i.counted_qty - i.expected_qty) * i.unit_cost end
      ), 0) as divergencia_absoluta
    from public.pdv_stock_counts c
    left join public.pdv_stock_count_items i on i.count_id = c.id
    where c.user_id = v_owner
      and c.status <> 'cancelada'
    group by c.id, c.name, c.status, c.opened_at
    order by c.opened_at desc
    limit greatest(1, coalesce(_limit, 12))
  ) t;

  return v_saida;
end;
$$;

grant execute on function public.pdv_stock_count_history(int) to authenticated;
