-- Contagem de estoque por categoria, além de por setor.
--
-- Duas coisas:
--
--  * `pdv_ingredients.category` guarda o ID da categoria, não o nome. O item da
--    contagem vinha congelando esse ID, que não serve nem para ler no relatório
--    nem para agrupar na tela. Agora congela os dois: `category_id` para
--    filtrar e `category` com o nome, para aparecer.
--
--  * O link só sabia recortar por setor. Setor é onde a coisa fica guardada
--    (cozinha, bar); categoria é o que a coisa é (vinhos, refrigerantes). Um
--    depósito real se divide pelos dois, e quem conta a adega não é quem conta
--    o seco.
--
-- Setor e categoria no mesmo link se cruzam (E, não OU): "vinhos do bar" é um
-- recorte legítimo, "tudo que é vinho ou está no bar" quase nunca é.

-- ---------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------

alter table public.pdv_stock_count_links
  add column if not exists categories text[];

alter table public.pdv_stock_count_items
  add column if not exists category_id text;

create index if not exists idx_stock_count_items_categoria
  on public.pdv_stock_count_items (count_id, category_id);

-- Retroativo: o que já foi congelado com o ID no lugar do nome.
update public.pdv_stock_count_items i
   set category_id = i.category,
       category = c.name
  from public.pdv_ingredient_categories c
 where i.category_id is null
   and i.category is not null
   and c.id::text = i.category;

-- Categoria que não casou com nenhuma cadastrada: preserva o valor bruto no id
-- e limpa o nome, para a tela não exibir um uuid como se fosse rótulo.
update public.pdv_stock_count_items
   set category_id = category,
       category = null
 where category_id is null
   and category is not null
   and category ~ '^[0-9a-f-]{36}$';

-- ---------------------------------------------------------------------------
-- 2. Abertura: congela o nome da categoria e aceita recorte por categoria
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
set search_path = public, extensions
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
    count_id, user_id, ingredient_id, ingredient_name, unit, sector,
    category, category_id,
    expected_qty, unit_cost, pack_size, ean, sort_order
  )
  select
    v_count_id, v_owner, i.id, i.name, i.unit, i.sector,
    -- Nome para ler; id para filtrar.
    c.name, nullif(i.category, ''),
    coalesce(i.current_stock, 0),
    coalesce(nullif(i.average_cost, 0), i.unit_cost, 0),
    nullif(i.purchase_lot, 0),
    nullif(i.ean, ''),
    i.count_order
  from public.pdv_ingredients i
  left join public.pdv_ingredient_categories c
         on c.id::text = i.category and c.user_id = i.user_id
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
      count_id, user_id, label, password_hash, sectors, categories, expires_at
    ) values (
      v_count_id, v_owner,
      coalesce(v_link->>'label', 'Contagem'),
      crypt(v_link->>'password', gen_salt('bf')),
      case
        when v_link->'sectors' is null or jsonb_typeof(v_link->'sectors') <> 'array' then null
        else array(select jsonb_array_elements_text(v_link->'sectors'))
      end,
      case
        when v_link->'categories' is null or jsonb_typeof(v_link->'categories') <> 'array' then null
        else array(select jsonb_array_elements_text(v_link->'categories'))
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
-- 3. Entrada do operador: recorte por setor E por categoria
-- ---------------------------------------------------------------------------

create or replace function public.pdv_stock_count_open(
  _token uuid,
  _password text,
  _counter_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link record;
  v_count record;
  v_session uuid;
  v_itens jsonb;
begin
  select * into v_link from public.pdv_stock_count_links where token = _token;
  if not found then
    return jsonb_build_object('error', 'invalid_credentials');
  end if;

  if v_link.locked_until is not null and v_link.locked_until > now() then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;
  if v_link.expires_at <= now() then
    return jsonb_build_object('error', 'link_expired');
  end if;

  if crypt(coalesce(_password, ''), v_link.password_hash) <> v_link.password_hash then
    update public.pdv_stock_count_links
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' end
     where id = v_link.id;
    return jsonb_build_object('error', 'invalid_credentials');
  end if;

  select * into v_count from public.pdv_stock_counts where id = v_link.count_id;
  if v_count.status <> 'aberta' then
    return jsonb_build_object('error', 'count_closed');
  end if;

  update public.pdv_stock_count_links
     set failed_attempts = 0, locked_until = null
   where id = v_link.id;

  insert into public.pdv_stock_count_sessions (link_id, count_id, user_id, counter_name)
  values (v_link.id, v_link.count_id, v_link.user_id, nullif(_counter_name, ''))
  returning session_token into v_session;

  -- Ordem: setor, categoria, ordem de prateleira, nome. Categoria entra antes
  -- da prateleira porque quem conta a adega conta vinho atrás de vinho.
  select coalesce(
           jsonb_agg(t order by ordem_setor, ordem_categoria, ordem_item nulls last, nome),
           '[]'::jsonb)
    into v_itens
  from (
    select
      it.sector as ordem_setor,
      it.category as ordem_categoria,
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
      and (v_link.categories is null or it.category_id = any(v_link.categories))
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
