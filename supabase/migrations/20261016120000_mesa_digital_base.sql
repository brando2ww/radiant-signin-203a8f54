-- Mesa Digital · Fase 1: a base do pedido pelo QR code da mesa.
--
-- Decisões (docs/modulo-mesa/PLANO.md): o administrador escolhe um QR por
-- mesa ou um QR geral, e o QR gerado é definitivo; quem lê o QR informa nome e
-- celular e já pede, sem aprovação do garçom, e o pedido vai direto para a
-- cozinha; uma conta por mesa; sem pagamento pelo celular ("fechar a conta"
-- mostra o valor e manda a mesa para a fila do caixa).
--
-- O cliente é anônimo e NUNCA escreve em tabela. Tudo passa pelas funções
-- mesa_* abaixo, com o token do QR e o token da sessão, e o preço é calculado
-- no servidor (pdv_calcular_itens, da Fase 0). Nenhuma policy para anon.
--
-- Já aplicado à parte, em 16/10/2026, com autorização: os 11 atendimentos
-- vazios do Kōten foram cancelados e criado o índice
-- uniq_pdv_orders_um_aberto_por_mesa (repetido abaixo, idempotente).

create unique index if not exists uniq_pdv_orders_um_aberto_por_mesa
  on public.pdv_orders (table_id)
  where table_id is not null and status in ('aberta', 'aberto');

-- ── colunas novas ──
alter table public.pdv_comandas
  add column if not exists customer_phone text,
  add column if not exists origem text;           -- garcom | caixa | qr (nulo = antigo)
alter table public.pdv_comanda_items
  add column if not exists origem text,           -- qr quando veio do celular do cliente
  add column if not exists mesa_sessao_id uuid;

-- ── tabelas ──
create table if not exists public.mesa_config (
  user_id uuid primary key,
  tipo_qr text not null default 'por_mesa' check (tipo_qr in ('por_mesa', 'geral')),
  mensagem_boas_vindas text,
  mostrar_taxa_servico boolean not null default true,
  sessao_horas int not null default 6 check (sessao_horas between 1 and 24),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.mesa_qr_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tipo text not null check (tipo in ('mesa', 'geral')),
  table_id uuid references public.pdv_tables(id),
  -- 20 caracteres hexadecimais (80 bits): curto para o QR ficar legível,
  -- impossível de adivinhar.
  token text not null unique default encode(extensions.gen_random_bytes(10), 'hex'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  check ((tipo = 'mesa') = (table_id is not null))
);
create unique index if not exists uniq_mesa_qr_por_mesa on public.mesa_qr_codes (table_id) where tipo = 'mesa';
create unique index if not exists uniq_mesa_qr_geral on public.mesa_qr_codes (user_id) where tipo = 'geral';

create table if not exists public.mesa_sessoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  qr_code_id uuid not null references public.mesa_qr_codes(id),
  table_id uuid not null references public.pdv_tables(id),
  order_id uuid references public.pdv_orders(id),
  comanda_id uuid references public.pdv_comandas(id),
  nome text not null,
  celular text not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'ativa' check (status in ('ativa', 'conta_pedida', 'encerrada')),
  criada_em timestamptz not null default now(),
  ultimo_acesso timestamptz not null default now(),
  expira_em timestamptz not null,
  user_agent text
);
create index if not exists idx_mesa_sessoes_comanda on public.mesa_sessoes (comanda_id);
create index if not exists idx_mesa_sessoes_mesa on public.mesa_sessoes (table_id, criada_em);

create table if not exists public.mesa_pedidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sessao_id uuid not null references public.mesa_sessoes(id),
  comanda_id uuid not null references public.pdv_comandas(id),
  chave text not null,
  itens jsonb not null,
  item_ids uuid[] not null default '{}',
  total numeric not null default 0,
  criado_em timestamptz not null default now(),
  unique (sessao_id, chave)
);

create table if not exists public.mesa_chamados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  table_id uuid not null references public.pdv_tables(id),
  sessao_id uuid references public.mesa_sessoes(id),
  comanda_id uuid references public.pdv_comandas(id),
  tipo text not null check (tipo in ('garcom', 'conta')),
  status text not null default 'aberto' check (status in ('aberto', 'atendido')),
  criado_em timestamptz not null default now(),
  atendido_por uuid,
  atendido_em timestamptz
);
create index if not exists idx_mesa_chamados_abertos on public.mesa_chamados (user_id) where status = 'aberto';

-- O QR é definitivo: o token, o tipo e a mesa nunca mudam, e ele não se apaga.
create or replace function public.mesa_qr_imutavel()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'QR code não pode ser apagado; desative-o';
  end if;
  if new.token <> old.token or new.tipo <> old.tipo
     or new.table_id is distinct from old.table_id or new.user_id <> old.user_id then
    raise exception 'QR code gerado é definitivo e não pode ser alterado';
  end if;
  return new;
end $$;
drop trigger if exists trg_mesa_qr_imutavel on public.mesa_qr_codes;
create trigger trg_mesa_qr_imutavel before update or delete on public.mesa_qr_codes
  for each row execute function public.mesa_qr_imutavel();

-- ── RLS: só a equipe da loja lê; escrita pela equipe só onde faz sentido ──
alter table public.mesa_config enable row level security;
alter table public.mesa_qr_codes enable row level security;
alter table public.mesa_sessoes enable row level security;
alter table public.mesa_pedidos enable row level security;
alter table public.mesa_chamados enable row level security;

drop policy if exists mesa_config_ler on public.mesa_config;
create policy mesa_config_ler on public.mesa_config for select to authenticated
  using (auth.uid() = user_id or is_establishment_member(user_id));
drop policy if exists mesa_config_dono on public.mesa_config;
create policy mesa_config_dono on public.mesa_config for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists mesa_qr_ler on public.mesa_qr_codes;
create policy mesa_qr_ler on public.mesa_qr_codes for select to authenticated
  using (auth.uid() = user_id or is_establishment_member(user_id));

drop policy if exists mesa_sessoes_ler on public.mesa_sessoes;
create policy mesa_sessoes_ler on public.mesa_sessoes for select to authenticated
  using (auth.uid() = user_id or is_establishment_member(user_id));

drop policy if exists mesa_pedidos_ler on public.mesa_pedidos;
create policy mesa_pedidos_ler on public.mesa_pedidos for select to authenticated
  using (auth.uid() = user_id or is_establishment_member(user_id));

drop policy if exists mesa_chamados_ler on public.mesa_chamados;
create policy mesa_chamados_ler on public.mesa_chamados for select to authenticated
  using (auth.uid() = user_id or is_establishment_member(user_id));

-- ── módulo liberado? (mesmo modelo de ponto_tem_modulo) ──
create or replace function public.mesa_tem_modulo(_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenants t
      join public.tenant_modules tm on tm.tenant_id = t.id
     where t.owner_user_id = _owner and tm.module = 'mesa' and tm.is_active
       and (tm.expires_at is null or tm.expires_at > now()))
$$;

-- ── abrir a mesa (ou entrar no atendimento aberto) numa transação só ──
-- Devolve order_id e comanda_id. Uma conta por mesa: se a mesa já está aberta
-- (pelo garçom ou por outro cliente), usa a comanda aberta dela.
create or replace function public.pdv_abrir_atendimento_interno(
  p_owner uuid, p_table_id uuid, p_nome text, p_telefone text, p_origem text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_mesa      record;
  v_order     uuid;
  v_comanda   uuid;
  v_numero    text;
  v_sessao_cx uuid;
begin
  select * into v_mesa from pdv_tables
   where id = p_table_id and user_id = p_owner and is_active and deleted_at is null
   for update;
  if not found or coalesce(v_mesa.is_virtual, false) then
    raise exception 'mesa_invalida';
  end if;

  if v_mesa.current_order_id is not null then
    select id into v_order from pdv_orders
     where id = v_mesa.current_order_id and status in ('aberta', 'aberto');
  end if;

  if v_order is not null then
    -- Mesa fechando a conta não recebe gente nova.
    if exists (select 1 from pdv_comandas where order_id = v_order
                and status in ('aguardando_pagamento', 'em_cobranca')) then
      raise exception 'conta_em_fechamento';
    end if;
    select id into v_comanda from pdv_comandas
     where order_id = v_order and status = 'aberta'
     order by created_at limit 1;
    if v_comanda is not null then
      update pdv_comandas
         set customer_phone = coalesce(customer_phone, p_telefone),
             customer_name = coalesce(customer_name, p_nome)
       where id = v_comanda;
      return jsonb_build_object('order_id', v_order, 'comanda_id', v_comanda, 'nova', false);
    end if;
  else
    -- Mesa livre: abre o atendimento. Exige caixa aberto (regra da comanda).
    begin
      insert into pdv_orders (user_id, order_number, source, table_id, customer_name, status,
                              subtotal, service_fee, discount, total, opened_at)
      values (p_owner, 'PDV' || right(((extract(epoch from clock_timestamp()) * 1000)::bigint)::text, 6),
              'salao', p_table_id, p_nome, 'aberta', 0, 0, 0, 0, now())
      returning id into v_order;
    exception when unique_violation then
      -- Outra pessoa abriu a mesma mesa no mesmo instante: entra no dela.
      select id into v_order from pdv_orders
       where table_id = p_table_id and status in ('aberta', 'aberto') limit 1;
    end;
    perform pdv_assign_order_ticket(v_order);
    update pdv_tables set status = 'ocupada', current_order_id = v_order, updated_at = now()
     where id = p_table_id;
  end if;

  select comanda_number, cashier_session_id into v_numero, v_sessao_cx
    from pdv_next_comanda_number(p_owner);   -- lança 'Caixa fechado...' sem caixa aberto
  insert into pdv_comandas (user_id, order_id, comanda_number, cashier_session_id,
                            customer_name, customer_phone, origem, status, subtotal)
  values (p_owner, v_order, v_numero, v_sessao_cx, p_nome, p_telefone, p_origem, 'aberta', 0)
  returning id into v_comanda;

  return jsonb_build_object('order_id', v_order, 'comanda_id', v_comanda, 'nova', true);
end;
$$;

-- ── o QR e o restaurante ──
-- Produto aparece no cardápio da mesa? (atalho da Fase 1: o cadastro do salão
-- com o que o "Cardápio do garçom" esconde; o Cardápio do Salão próprio vem na Fase 2)
create or replace function public.mesa_produto_visivel(p_owner uuid, p_product_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pdv_products p
     where p.id = p_product_id and p.user_id = p_owner and p.is_available
       and not coalesce(p.category = any(coalesce((select categorias_ocultas from pdv_waiter_menu_settings s where s.user_id = p_owner), '{}'::text[])), false)
       and not exists (select 1 from pdv_waiter_menu_items w
                        where w.user_id = p_owner and w.product_id = p.id
                          and (w.oculto or w.pai_product_id is not null)))
$$;

create or replace function public.mesa_abrir(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_qr    record;
  v_nome  text;
  v_bs    record;
  v_ps    record;
  v_mesas jsonb;
begin
  select q.id, q.user_id, q.tipo, q.table_id, q.ativo,
         coalesce(c.mostrar_taxa_servico, true) as mostrar_taxa_servico, c.mensagem_boas_vindas
    into v_qr
    from mesa_qr_codes q left join mesa_config c on c.user_id = q.user_id
   where q.token = lower(trim(p_token));
  if v_qr.id is null then return jsonb_build_object('error', 'qr_invalido'); end if;
  if not v_qr.ativo then return jsonb_build_object('error', 'qr_desativado'); end if;
  if not mesa_tem_modulo(v_qr.user_id) then return jsonb_build_object('error', 'modulo_inativo'); end if;

  select business_name, logo_url, cover_url, primary_color, secondary_color into v_bs
    from business_settings where user_id = v_qr.user_id limit 1;
  select business_name, enable_service_fee, service_fee_percentage into v_ps
    from pdv_settings where user_id = v_qr.user_id limit 1;
  select coalesce(nullif(v_bs.business_name, ''), nullif(v_ps.business_name, ''), t.name) into v_nome
    from tenants t where t.owner_user_id = v_qr.user_id limit 1;

  if v_qr.tipo = 'geral' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'numero', table_number) order by
             nullif(regexp_replace(table_number, '\D', '', 'g'), '')::int nulls last, table_number), '[]'::jsonb)
      into v_mesas
      from pdv_tables where user_id = v_qr.user_id and is_active and deleted_at is null and not coalesce(is_virtual, false);
  end if;

  return jsonb_build_object(
    'restaurante', jsonb_build_object('nome', coalesce(v_nome, 'Restaurante'), 'logo_url', v_bs.logo_url,
                                       'capa_url', v_bs.cover_url, 'cor', v_bs.primary_color, 'cor2', v_bs.secondary_color),
    'mensagem', v_qr.mensagem_boas_vindas,
    'tipo', v_qr.tipo,
    'mesa', case when v_qr.tipo = 'mesa' then
              (select jsonb_build_object('id', id, 'numero', table_number) from pdv_tables where id = v_qr.table_id) end,
    'mesas', v_mesas,
    'caixa_aberto', exists (select 1 from pdv_cashier_sessions where user_id = v_qr.user_id and closed_at is null),
    'taxa_servico', case when v_qr.mostrar_taxa_servico and coalesce(v_ps.enable_service_fee, false)
                         then coalesce(v_ps.service_fee_percentage, 10) end);
end $$;

-- ── cardápio da mesa ──
-- Um produto em JSON: preço de salão, etapas (composição) e opções.
create or replace function public.mesa_produto_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'nome', p.name, 'descricao', p.description, 'foto', p.image_url,
    'preco', coalesce(p.price_salon, 0), 'serve', p.serves,
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'nome', g.name, 'tipo', g.type, 'obrigatorio', g.is_required,
               'min', g.min_selections, 'max', g.max_selections, 'quantidade', g.allow_quantity,
               'itens', coalesce((
                  select jsonb_agg(jsonb_build_object('id', cp.id, 'nome', ch.name, 'foto', ch.image_url)
                                   order by cp.order_position, cp.created_at)
                    from pdv_product_compositions cp join pdv_products ch on ch.id = cp.child_product_id
                   where cp.group_id = g.id), '[]'::jsonb))
             order by g.order_position, g.created_at)
        from pdv_product_composition_groups g where g.parent_product_id = p.id), '[]'::jsonb),
    'opcoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'nome', o.name, 'tipo', o.type, 'obrigatorio', o.is_required,
               'min', o.min_selections, 'max', o.max_selections,
               'itens', coalesce((
                  select jsonb_agg(jsonb_build_object('id', oi.id, 'nome', oi.name,
                           'preco', case when lp.id is not null then coalesce(lp.price_salon, 0)
                                         else coalesce(oi.price_adjustment, 0) end)
                                   order by oi.order_position, oi.created_at)
                    from pdv_product_option_items oi left join pdv_products lp on lp.id = oi.linked_product_id
                   where oi.option_id = o.id and oi.is_available), '[]'::jsonb))
             order by o.order_position, o.created_at)
        from pdv_product_options o where o.product_id = p.id), '[]'::jsonb))
  from pdv_products p where p.id = p_id
$$;

create or replace function public.mesa_cardapio(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_qr    record;
  v_ordem text[];
  v_saida jsonb;
begin
  select id, user_id, ativo into v_qr from mesa_qr_codes where token = lower(trim(p_token));
  if v_qr.id is null or not v_qr.ativo or not mesa_tem_modulo(v_qr.user_id) then
    return jsonb_build_object('error', 'qr_invalido');
  end if;
  select categorias_ordem into v_ordem from pdv_waiter_menu_settings where user_id = v_qr.user_id;

  with prods as (
    select p.id, p.name, coalesce(nullif(trim(p.category), ''), 'Outros') as categoria
      from pdv_products p
     where p.user_id = v_qr.user_id and mesa_produto_visivel(v_qr.user_id, p.id)
  ), por_categoria as (
    select categoria, jsonb_agg(mesa_produto_json(id) order by name) as produtos
      from prods group by categoria
  )
  select coalesce(jsonb_agg(jsonb_build_object('nome', categoria, 'produtos', produtos)
                            order by coalesce(array_position(v_ordem, categoria), 100000), categoria), '[]'::jsonb)
    into v_saida
    from por_categoria;

  return jsonb_build_object('categorias', v_saida);
end $$;

-- ── validar o que o cliente escolheu (mesma regra das telas do garçom) ──
create or replace function public.mesa_validar_itens(p_owner uuid, p_itens jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_item jsonb; v_qtd int; v_prod record; v_g record; v_total int; v_min int;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'pedido_vazio';
  end if;
  if jsonb_array_length(p_itens) > 30 then raise exception 'pedido_grande_demais'; end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item->>'quantity')::int, 0);
    if v_qtd < 1 or v_qtd > 20 then raise exception 'quantidade_invalida'; end if;
    if not mesa_produto_visivel(p_owner, (v_item->>'product_id')::uuid) then
      raise exception 'produto_indisponivel';
    end if;
    select id, name into v_prod from pdv_products where id = (v_item->>'product_id')::uuid;

    for v_g in select id, is_required, min_selections, max_selections, type from pdv_product_composition_groups
                where parent_product_id = v_prod.id loop
      select count(*) into v_total
        from jsonb_array_elements(coalesce(v_item->'selected_options', '[]'::jsonb)) s,
             jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) i
       where (s->>'optionId')::uuid = v_g.id;
      v_min := case when v_g.is_required then greatest(coalesce(v_g.min_selections, 0), 1) else 0 end;
      if v_total < v_min or (coalesce(v_g.max_selections, 0) > 0 and v_total > v_g.max_selections) then
        raise exception 'escolha_invalida: %', v_prod.name;
      end if;
    end loop;

    for v_g in select id, is_required, min_selections, max_selections, type from pdv_product_options
                where product_id = v_prod.id loop
      select count(*) into v_total
        from jsonb_array_elements(coalesce(v_item->'selected_options', '[]'::jsonb)) s,
             jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) i
       where (s->>'optionId')::uuid = v_g.id;
      v_min := case when v_g.is_required then greatest(coalesce(v_g.min_selections, 0), 1) else 0 end;
      if v_total < v_min or (coalesce(v_g.max_selections, 0) > 0 and v_total > v_g.max_selections)
         or (v_g.type = 'single' and v_total > 1) then
        raise exception 'escolha_invalida: %', v_prod.name;
      end if;
      -- item de opção indisponível não pode ser escolhido
      if exists (select 1 from jsonb_array_elements(coalesce(v_item->'selected_options', '[]'::jsonb)) s,
                              jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) i
                  join pdv_product_option_items oi on oi.id = (i->>'itemId')::uuid
                 where (s->>'optionId')::uuid = v_g.id and not oi.is_available) then
        raise exception 'escolha_indisponivel: %', v_prod.name;
      end if;
    end loop;
  end loop;
end $$;

-- Observação do item como o garçom monta: opções sem produto vinculado
-- ("Ponto: mal passado") + a observação livre do cliente.
create or replace function public.mesa_montar_observacao(p_item jsonb)
returns text language sql stable security definer set search_path = public as $$
  select nullif(concat_ws(' | ',
    nullif((select string_agg(o.name || ': ' || nomes, '; ' order by ord)
              from (select s.ord, s.v->>'optionId' as oid,
                           (select string_agg(oi.name, ', ' order by io)
                              from jsonb_array_elements(coalesce(s.v->'items', '[]'::jsonb)) with ordinality as x(i, io)
                              join pdv_product_option_items oi on oi.id = (x.i->>'itemId')::uuid
                             where oi.linked_product_id is null) as nomes
                      from jsonb_array_elements(coalesce(p_item->'selected_options', '[]'::jsonb)) with ordinality as s(v, ord)) g
              join pdv_product_options o on o.id = g.oid::uuid
             where g.nomes is not null), ''),
    nullif(left(trim(coalesce(p_item->>'notes', '')), 140), '')), '')
$$;

-- ── o cliente entra na mesa ──
create or replace function public.mesa_entrar(p_token text, p_table_id uuid, p_nome text, p_celular text, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_qr    record;
  v_mesa  uuid;
  v_nome  text := left(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), 60);
  v_cel   text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_at    jsonb;
  v_sessao record;
begin
  select q.*, coalesce(c.sessao_horas, 6) as horas into v_qr
    from mesa_qr_codes q left join mesa_config c on c.user_id = q.user_id
   where q.token = lower(trim(p_token));
  if v_qr.id is null then return jsonb_build_object('error', 'qr_invalido'); end if;
  if not v_qr.ativo then return jsonb_build_object('error', 'qr_desativado'); end if;
  if not mesa_tem_modulo(v_qr.user_id) then return jsonb_build_object('error', 'modulo_inativo'); end if;

  if length(v_nome) < 2 then return jsonb_build_object('error', 'nome_invalido'); end if;
  if v_cel ~ '^55\d{10,11}$' then v_cel := substr(v_cel, 3); end if;
  if v_cel !~ '^\d{10,11}$' then return jsonb_build_object('error', 'celular_invalido'); end if;

  v_mesa := case when v_qr.tipo = 'mesa' then v_qr.table_id else p_table_id end;
  if v_mesa is null then return jsonb_build_object('error', 'mesa_invalida'); end if;

  -- Travas contra abuso, sem depender do garçom.
  if (select count(*) from mesa_sessoes where table_id = v_mesa and criada_em > now() - interval '10 minutes') >= 15
     or (select count(*) from mesa_sessoes where user_id = v_qr.user_id and criada_em > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('error', 'muitas_tentativas');
  end if;

  begin
    v_at := pdv_abrir_atendimento_interno(v_qr.user_id, v_mesa, v_nome, v_cel, 'qr');
  exception when others then
    if sqlerrm like 'Caixa fechado%' then return jsonb_build_object('error', 'caixa_fechado'); end if;
    if sqlerrm in ('mesa_invalida', 'conta_em_fechamento') then return jsonb_build_object('error', sqlerrm); end if;
    raise;
  end;

  insert into mesa_sessoes (user_id, qr_code_id, table_id, order_id, comanda_id, nome, celular, expira_em, user_agent)
  values (v_qr.user_id, v_qr.id, v_mesa, (v_at->>'order_id')::uuid, (v_at->>'comanda_id')::uuid,
          v_nome, v_cel, now() + make_interval(hours => v_qr.horas), left(p_user_agent, 300))
  returning * into v_sessao;

  return jsonb_build_object('sessao', v_sessao.token, 'nome', v_nome,
    'mesa', (select table_number from pdv_tables where id = v_mesa));
end $$;

-- Sessão válida (ou motivo de não ser).
create or replace function public.mesa_sessao_valida(p_sessao uuid)
returns public.mesa_sessoes language plpgsql security definer set search_path = public as $$
declare v public.mesa_sessoes; v_status_comanda text;
begin
  select * into v from mesa_sessoes where token = p_sessao;
  if v.id is null then return v; end if;
  select status into v_status_comanda from pdv_comandas where id = v.comanda_id;
  if v.status <> 'encerrada' and (v.expira_em < now()
     or v_status_comanda in ('fechada', 'fechado', 'cancelada', 'paga')) then
    update mesa_sessoes set status = 'encerrada' where id = v.id;
    v.status := 'encerrada';
  elsif v.status <> 'encerrada' then
    update mesa_sessoes set ultimo_acesso = now() where id = v.id;
  end if;
  return v;
end $$;

-- ── o que o celular mostra: itens, total, chamados ──
create or replace function public.mesa_estado(p_sessao uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s record; v_c record; v_taxa numeric; v_ps record; v_cfg record;
begin
  select * into v_s from mesa_sessao_valida(p_sessao);
  if v_s.id is null then return jsonb_build_object('error', 'sessao_invalida'); end if;

  select id, status, subtotal, comanda_number into v_c from pdv_comandas where id = v_s.comanda_id;
  select enable_service_fee, service_fee_percentage into v_ps from pdv_settings where user_id = v_s.user_id limit 1;
  select mostrar_taxa_servico into v_cfg from mesa_config where user_id = v_s.user_id;
  v_taxa := case when coalesce(v_cfg.mostrar_taxa_servico, true) and coalesce(v_ps.enable_service_fee, false)
                 then round(coalesce(v_c.subtotal, 0) * coalesce(v_ps.service_fee_percentage, 10) / 100, 2) else 0 end;

  return jsonb_build_object(
    'status', v_s.status,
    'nome', v_s.nome,
    'mesa', (select table_number from pdv_tables where id = v_s.table_id),
    'comanda_status', v_c.status,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', i.id, 'nome', i.product_name, 'quantidade', i.quantity, 'preco', i.unit_price,
                'subtotal', i.subtotal, 'obs', i.notes, 'enviado', i.sent_to_kitchen_at is not null,
                'pelo_qr', i.origem = 'qr', 'hora', i.created_at,
                'subitens', (select coalesce(jsonb_agg(f.product_name order by f.composition_position), '[]'::jsonb)
                               from pdv_comanda_items f where f.parent_item_id = i.id))
                order by i.created_at), '[]'::jsonb)
                from pdv_comanda_items i where i.comanda_id = v_s.comanda_id and i.parent_item_id is null),
    'subtotal', coalesce(v_c.subtotal, 0),
    'taxa_servico', v_taxa,
    'total', coalesce(v_c.subtotal, 0) + v_taxa,
    'chamado_aberto', exists (select 1 from mesa_chamados where table_id = v_s.table_id and status = 'aberto' and tipo = 'garcom'),
    'conta_pedida', v_s.status = 'conta_pedida' or v_c.status in ('aguardando_pagamento', 'em_cobranca'));
end $$;

-- ── pedir: valida, calcula no servidor, lança e manda para a cozinha ──
create or replace function public.mesa_pedir(p_sessao uuid, p_itens jsonb, p_chave text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s record; v_status text; v_itens jsonb; v_item jsonb; v_ids uuid[]; v_todos uuid[]; v_total numeric; v_existente record;
begin
  select * into v_s from mesa_sessao_valida(p_sessao);
  if v_s.id is null then return jsonb_build_object('error', 'sessao_invalida'); end if;
  if v_s.status = 'encerrada' then return jsonb_build_object('error', 'sessao_encerrada'); end if;
  if v_s.status = 'conta_pedida' then return jsonb_build_object('error', 'conta_pedida'); end if;
  if not mesa_tem_modulo(v_s.user_id) then return jsonb_build_object('error', 'modulo_inativo'); end if;
  if coalesce(trim(p_chave), '') = '' then return jsonb_build_object('error', 'chave_obrigatoria'); end if;

  -- Toque duplo / reenvio: mesma chave devolve o mesmo pedido.
  select * into v_existente from mesa_pedidos where sessao_id = v_s.id and chave = p_chave;
  if found then return jsonb_build_object('ok', true, 'total', v_existente.total, 'repetido', true); end if;

  if (select count(*) from mesa_pedidos where sessao_id = v_s.id and criado_em > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('error', 'muitos_pedidos');
  end if;

  select status into v_status from pdv_comandas where id = v_s.comanda_id for update;
  if v_status <> 'aberta' then return jsonb_build_object('error', 'conta_pedida'); end if;

  begin
    perform mesa_validar_itens(v_s.user_id, p_itens);
  exception when others then
    return jsonb_build_object('error', split_part(sqlerrm, ':', 1), 'detalhe', nullif(trim(split_part(sqlerrm, ':', 2)), ''));
  end;

  -- Só o que importa sai do celular: produto, quantidade, escolhas e a
  -- observação livre. Nome, preço e a observação das opções são do servidor.
  select jsonb_agg(jsonb_build_object(
           'product_id', v->>'product_id', 'quantity', (v->>'quantity')::int,
           'notes', mesa_montar_observacao(v),
           'selected_options', coalesce(v->'selected_options', '[]'::jsonb)))
    into v_itens from jsonb_array_elements(p_itens) v;

  v_ids := pdv_lancar_itens_interno(v_s.user_id, v_s.comanda_id, v_itens);
  update pdv_comanda_items set origem = 'qr', mesa_sessao_id = v_s.id
   where id = any(v_ids) or parent_item_id = any(v_ids);
  perform pdv_enviar_cozinha_interno(v_s.user_id, v_ids, 'Mesa · ' || v_s.nome);

  select coalesce(sum(subtotal), 0) into v_total from pdv_comanda_items where id = any(v_ids);
  insert into mesa_pedidos (user_id, sessao_id, comanda_id, chave, itens, item_ids, total)
  values (v_s.user_id, v_s.id, v_s.comanda_id, p_chave, p_itens, v_ids, v_total);

  return jsonb_build_object('ok', true, 'total', v_total);
end $$;

-- ── chamar o garçom ──
create or replace function public.mesa_chamar(p_sessao uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s record;
begin
  select * into v_s from mesa_sessao_valida(p_sessao);
  if v_s.id is null or v_s.status = 'encerrada' then return jsonb_build_object('error', 'sessao_invalida'); end if;
  if not exists (select 1 from mesa_chamados where table_id = v_s.table_id and tipo = 'garcom' and status = 'aberto') then
    insert into mesa_chamados (user_id, table_id, sessao_id, comanda_id, tipo)
    values (v_s.user_id, v_s.table_id, v_s.id, v_s.comanda_id, 'garcom');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── fechar a conta: mostra o valor e manda a mesa para a fila do caixa ──
create or replace function public.mesa_fechar_conta(p_sessao uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s record; v_c record;
begin
  select * into v_s from mesa_sessao_valida(p_sessao);
  if v_s.id is null or v_s.status = 'encerrada' then return jsonb_build_object('error', 'sessao_invalida'); end if;

  select id, status into v_c from pdv_comandas where id = v_s.comanda_id for update;
  if not exists (select 1 from pdv_comanda_items where comanda_id = v_c.id) then
    return jsonb_build_object('error', 'sem_itens');
  end if;
  if v_c.status = 'aberta' then
    update pdv_comandas set status = 'aguardando_pagamento', closed_by_waiter_at = now(), updated_at = now()
     where id = v_c.id;
  end if;
  update mesa_sessoes set status = 'conta_pedida' where comanda_id = v_c.id and status = 'ativa';
  if not exists (select 1 from mesa_chamados where comanda_id = v_c.id and tipo = 'conta' and status = 'aberto') then
    insert into mesa_chamados (user_id, table_id, sessao_id, comanda_id, tipo)
    values (v_s.user_id, v_s.table_id, v_s.id, v_c.id, 'conta');
  end if;
  return mesa_estado(p_sessao);
end $$;

-- ── equipe: gerar o QR (definitivo), desativar e atender chamado ──
create or replace function public.mesa_gerar_qr(p_table_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_qr record;
begin
  v_owner := pdv_resolve_owner(auth.uid());
  if v_owner is null or not (auth.uid() = v_owner or is_establishment_member(v_owner)) then
    raise exception 'Sem permissão';
  end if;
  if p_table_id is not null and not exists (
       select 1 from pdv_tables where id = p_table_id and user_id = v_owner and not coalesce(is_virtual, false)) then
    raise exception 'Mesa não encontrada';
  end if;
  if p_table_id is null then
    select * into v_qr from mesa_qr_codes where user_id = v_owner and tipo = 'geral';
  else
    select * into v_qr from mesa_qr_codes where table_id = p_table_id;
  end if;
  if v_qr.id is null then
    insert into mesa_qr_codes (user_id, tipo, table_id, criado_por)
    values (v_owner, case when p_table_id is null then 'geral' else 'mesa' end, p_table_id, auth.uid())
    returning * into v_qr;
  end if;
  return to_jsonb(v_qr);
end $$;

create or replace function public.mesa_definir_qr_ativo(p_qr_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  v_owner := pdv_resolve_owner(auth.uid());
  update mesa_qr_codes set ativo = p_ativo
   where id = p_qr_id and user_id = v_owner and (auth.uid() = v_owner or is_establishment_member(v_owner));
end $$;

create or replace function public.mesa_atender_chamado(p_chamado_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  v_owner := pdv_resolve_owner(auth.uid());
  update mesa_chamados set status = 'atendido', atendido_por = auth.uid(), atendido_em = now()
   where id = p_chamado_id and user_id = v_owner and status = 'aberto'
     and (auth.uid() = v_owner or is_establishment_member(v_owner));
end $$;

-- Comanda paga ou cancelada encerra as sessões e os chamados dela.
create or replace function public.mesa_encerrar_com_comanda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('fechada', 'fechado', 'cancelada', 'paga') and new.status is distinct from old.status then
    update mesa_sessoes set status = 'encerrada' where comanda_id = new.id and status <> 'encerrada';
    update mesa_chamados set status = 'atendido', atendido_em = now() where comanda_id = new.id and status = 'aberto';
  end if;
  return new;
end $$;
drop trigger if exists trg_mesa_encerrar_com_comanda on public.pdv_comandas;
create trigger trg_mesa_encerrar_com_comanda after update of status on public.pdv_comandas
  for each row execute function public.mesa_encerrar_com_comanda();

-- ── permissões ──
revoke all on function public.pdv_abrir_atendimento_interno(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.mesa_produto_visivel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mesa_produto_json(uuid) from public, anon, authenticated;
revoke all on function public.mesa_validar_itens(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.mesa_montar_observacao(jsonb) from public, anon, authenticated;
revoke all on function public.mesa_sessao_valida(uuid) from public, anon, authenticated;
revoke all on function public.mesa_qr_imutavel() from public, anon, authenticated;
revoke all on function public.mesa_encerrar_com_comanda() from public, anon, authenticated;

revoke all on function public.mesa_abrir(text) from public;
revoke all on function public.mesa_cardapio(text) from public;
revoke all on function public.mesa_entrar(text, uuid, text, text, text) from public;
revoke all on function public.mesa_estado(uuid) from public;
revoke all on function public.mesa_pedir(uuid, jsonb, text) from public;
revoke all on function public.mesa_chamar(uuid) from public;
revoke all on function public.mesa_fechar_conta(uuid) from public;
grant execute on function public.mesa_abrir(text) to anon, authenticated;
grant execute on function public.mesa_cardapio(text) to anon, authenticated;
grant execute on function public.mesa_entrar(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.mesa_estado(uuid) to anon, authenticated;
grant execute on function public.mesa_pedir(uuid, jsonb, text) to anon, authenticated;
grant execute on function public.mesa_chamar(uuid) to anon, authenticated;
grant execute on function public.mesa_fechar_conta(uuid) to anon, authenticated;

revoke all on function public.mesa_gerar_qr(uuid) from public, anon;
revoke all on function public.mesa_definir_qr_ativo(uuid, boolean) from public, anon;
revoke all on function public.mesa_atender_chamado(uuid) from public, anon;
grant execute on function public.mesa_gerar_qr(uuid) to authenticated;
grant execute on function public.mesa_definir_qr_ativo(uuid, boolean) to authenticated;
grant execute on function public.mesa_atender_chamado(uuid) to authenticated;
revoke all on function public.mesa_tem_modulo(uuid) from public, anon;
grant execute on function public.mesa_tem_modulo(uuid) to authenticated;

-- ── tempo real: a equipe vê mesa aberta pelo QR e os chamados na hora ──
do $$
declare t text;
begin
  foreach t in array array['pdv_tables', 'pdv_comandas', 'pdv_orders', 'mesa_chamados', 'mesa_sessoes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
