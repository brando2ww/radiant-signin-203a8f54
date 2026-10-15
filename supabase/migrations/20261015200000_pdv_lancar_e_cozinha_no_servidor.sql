-- Mesa Digital · Fase 0: lançar item e mandar para a cozinha passam a ser feitos
-- no servidor.
--
-- Até aqui o navegador do garçom calculava o preço (price_salon + opções),
-- expandia opções e composição em sub-itens, resolvia o centro de produção e
-- montava os cupons da cozinha. Um cliente pelo QR da mesa não pode fazer nada
-- disso: o preço viria do celular dele e ele nem tem acesso às tabelas. Estas
-- funções são o porte fiel de:
--   src/utils/expandSelectedOptions.ts, src/utils/expandComposition.ts,
--   src/utils/resolveProductionCenter.ts, o cálculo de preço de
--   GarcomAdicionarItem.tsx / ProductOptionSelector.tsx, e o
--   sendToKitchenMutation de src/hooks/use-pdv-comandas.ts.
-- O app do garçom passa a chamá-las, para existir uma regra de preço só.
--
-- Formato de p_itens (o mesmo que o rascunho do garçom já guarda):
--   [{ "product_id": uuid, "quantity": int, "notes": text,
--      "selected_options": [{ "optionId": uuid, "items": [{ "itemId": uuid }] }] }]
-- optionId é um grupo de composição (pdv_product_composition_groups) ou uma
-- opção (pdv_product_options) do produto. Nome e preço que o aparelho mande são
-- ignorados: tudo é lido do cadastro.

-- ── centro de produção de um produto (porte de resolveProductionCenter.ts) ──
create or replace function public.pdv_centro_do_produto(p_owner uuid, p_product_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select pc.id
    from pdv_products p
    join pdv_production_centers pc
      on pc.user_id = p_owner and pc.slug = p.printer_station and pc.is_active
   where p.id = p_product_id and p.printer_station is not null
   limit 1
$$;

-- ── cálculo puro: não grava nada ──
-- Devolve, para cada item, o que seria gravado: preço de salão calculado,
-- observação, centro de produção e os sub-itens da cozinha.
create or replace function public.pdv_calcular_itens(p_owner uuid, p_itens jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_item        jsonb;
  v_grupo       jsonb;
  v_escolha     jsonb;
  v_prod        record;
  v_qty         int;
  v_extra       numeric;
  v_grupo_idx   int;
  v_item_idx    int;
  v_tem_ligado  boolean;
  v_filhos      jsonb;
  v_ligados     jsonb;
  v_saida       jsonb := '[]'::jsonb;
  v_comp        record;
  v_opc         record;
  v_tipo        text;
  v_nome_grupo  text;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Lista de itens inválida';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then
      raise exception 'Quantidade inválida';
    end if;

    select id, name, price_salon, is_composite, printer_station
      into v_prod
      from pdv_products
     where id = (v_item->>'product_id')::uuid and user_id = p_owner;
    if not found then
      raise exception 'Produto não encontrado neste estabelecimento';
    end if;

    v_extra := 0;
    v_ligados := '[]'::jsonb;
    v_grupo_idx := 0;

    -- Escolhas: grupos de composição (preço 0, cada ocorrência vira sub-item)
    -- e opções (preço do produto vinculado ou price_adjustment).
    for v_grupo in
      select * from jsonb_array_elements(coalesce(v_item->'selected_options', '[]'::jsonb))
    loop
      v_tipo := null;
      select 'composicao', name into v_tipo, v_nome_grupo
        from pdv_product_composition_groups
       where id = (v_grupo->>'optionId')::uuid and parent_product_id = v_prod.id;
      if v_tipo is null then
        select 'opcao', name into v_tipo, v_nome_grupo
          from pdv_product_options
         where id = (v_grupo->>'optionId')::uuid and product_id = v_prod.id;
      end if;
      if v_tipo is null then
        raise exception 'Opção não pertence ao produto %', v_prod.name;
      end if;

      v_item_idx := 0;
      for v_escolha in select * from jsonb_array_elements(coalesce(v_grupo->'items', '[]'::jsonb)) loop
        if v_tipo = 'composicao' then
          select c.child_product_id as ligado, ch.id as ligado_existe
            into v_comp
            from pdv_product_compositions c
            left join pdv_products ch on ch.id = c.child_product_id
           where c.id = (v_escolha->>'itemId')::uuid and c.group_id = (v_grupo->>'optionId')::uuid;
          if not found then
            raise exception 'Item de etapa inválido em %', v_prod.name;
          end if;
          -- etapa entra a R$ 0
          if v_comp.ligado is not null then
            v_ligados := v_ligados || jsonb_build_object(
              'product_id', v_comp.ligado, 'label', v_nome_grupo,
              'position', v_grupo_idx * 1000 + v_item_idx);
            v_item_idx := v_item_idx + 1;
          end if;
        else
          select oi.linked_product_id as ligado, oi.price_adjustment,
                 lp.id as ligado_existe, lp.price_salon as preco_ligado
            into v_opc
            from pdv_product_option_items oi
            left join pdv_products lp on lp.id = oi.linked_product_id
           where oi.id = (v_escolha->>'itemId')::uuid and oi.option_id = (v_grupo->>'optionId')::uuid;
          if not found then
            raise exception 'Item de opção inválido em %', v_prod.name;
          end if;
          -- getItemPrice: produto vinculado vale o preço de salão dele;
          -- sem vínculo, vale o ajuste de preço da opção.
          if v_opc.ligado_existe is not null then
            v_extra := v_extra + coalesce(v_opc.preco_ligado, 0);
          else
            v_extra := v_extra + coalesce(v_opc.price_adjustment, 0);
          end if;
          if v_opc.ligado is not null then
            v_ligados := v_ligados || jsonb_build_object(
              'product_id', v_opc.ligado, 'label', v_nome_grupo,
              'position', v_grupo_idx * 1000 + v_item_idx);
            v_item_idx := v_item_idx + 1;
          end if;
        end if;
      end loop;
      v_grupo_idx := v_grupo_idx + 1;
    end loop;

    v_tem_ligado := jsonb_array_length(v_ligados) > 0;
    v_filhos := '[]'::jsonb;

    if v_tem_ligado then
      -- expandSelectedOptions: um sub-item por escolha ligada, com a quantidade do pai.
      select coalesce(jsonb_agg(jsonb_build_object(
               'product_id', p.id,
               'product_name', p.name,
               'quantity', v_qty,
               'production_center_id', pdv_centro_do_produto(p_owner, p.id),
               'composition_group_label', l->>'label',
               'composition_position', (l->>'position')::int)
             order by ord), '[]'::jsonb)
        into v_filhos
        from jsonb_array_elements(v_ligados) with ordinality as x(l, ord)
        join pdv_products p on p.id = (l->>'product_id')::uuid;
    elsif v_prod.is_composite then
      -- expandComposition: a composição fixa inteira, quantidade × quantidade do pai.
      select coalesce(jsonb_agg(jsonb_build_object(
               'product_id', ch.id,
               'product_name', ch.name,
               'quantity', (c.quantity * v_qty)::int,
               'production_center_id', pdv_centro_do_produto(p_owner, ch.id),
               'composition_group_label', null,
               'composition_position', c.order_position)
             order by c.order_position, c.created_at), '[]'::jsonb)
        into v_filhos
        from pdv_product_compositions c
        join pdv_products ch on ch.id = c.child_product_id
       where c.parent_product_id = v_prod.id;
    end if;

    v_saida := v_saida || jsonb_build_object(
      'product_id', v_prod.id,
      'product_name', v_prod.name,
      'quantity', v_qty,
      'unit_price', coalesce(v_prod.price_salon, 0) + v_extra,
      'subtotal', v_qty * (coalesce(v_prod.price_salon, 0) + v_extra),
      'notes', nullif(v_item->>'notes', ''),
      'production_center_id', pdv_centro_do_produto(p_owner, v_prod.id),
      'children', v_filhos);
  end loop;

  return v_saida;
end;
$$;

-- ── grava os itens calculados numa comanda (sem checar quem chama) ──
create or replace function public.pdv_lancar_itens_interno(p_owner uuid, p_comanda_id uuid, p_itens jsonb)
returns uuid[]
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
  v_linha  jsonb;
  v_filho  jsonb;
  v_pai    uuid;
  v_ids    uuid[] := '{}';
begin
  select status into v_status from pdv_comandas
   where id = p_comanda_id and user_id = p_owner
   for update;
  if not found then
    raise exception 'Comanda não encontrada';
  end if;
  if v_status not in ('aberta', 'aguardando_pagamento', 'em_cobranca') then
    raise exception 'Esta comanda já foi finalizada e não pode mais receber itens';
  end if;

  for v_linha in select * from jsonb_array_elements(pdv_calcular_itens(p_owner, p_itens)) loop
    insert into pdv_comanda_items
      (comanda_id, product_id, product_name, quantity, unit_price, subtotal, notes,
       kitchen_status, production_center_id)
    values
      (p_comanda_id, (v_linha->>'product_id')::uuid, v_linha->>'product_name',
       (v_linha->>'quantity')::int, (v_linha->>'unit_price')::numeric,
       (v_linha->>'subtotal')::numeric, v_linha->>'notes', 'pendente',
       (v_linha->>'production_center_id')::uuid)
    returning id into v_pai;
    v_ids := v_ids || v_pai;

    for v_filho in select * from jsonb_array_elements(v_linha->'children') loop
      insert into pdv_comanda_items
        (comanda_id, product_id, product_name, quantity, unit_price, subtotal, notes,
         kitchen_status, production_center_id, parent_item_id, is_composite_child,
         composition_group_label, composition_position)
      values
        (p_comanda_id, (v_filho->>'product_id')::uuid, v_filho->>'product_name',
         (v_filho->>'quantity')::int, 0, 0, null, 'pendente',
         (v_filho->>'production_center_id')::uuid, v_pai, true,
         v_filho->>'composition_group_label', (v_filho->>'composition_position')::int);
    end loop;
  end loop;

  return v_ids;
end;
$$;

-- ── o que o app chama: confere que quem chama é da loja dona da comanda ──
create or replace function public.pdv_lancar_itens(p_comanda_id uuid, p_itens jsonb)
returns uuid[]
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from pdv_comandas where id = p_comanda_id;
  if v_owner is null then
    raise exception 'Comanda não encontrada';
  end if;
  if auth.uid() is null or not (auth.uid() = v_owner or is_establishment_member(v_owner)) then
    raise exception 'Sem permissão para lançar itens nesta comanda';
  end if;
  return pdv_lancar_itens_interno(v_owner, p_comanda_id, p_itens);
end;
$$;

-- ── manda para a cozinha (sem checar quem chama) ──
-- Porte do sendToKitchenMutation: inclui os sub-itens pendentes, marca
-- sent_to_kitchen_at e cria um cupom por comanda + centro + impressora, com o
-- mesmo payload que a Print Bridge já imprime.
create or replace function public.pdv_enviar_cozinha_interno(p_owner uuid, p_item_ids uuid[], p_garcom text)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_ids   uuid[];
  v_jobs  int := 0;
  v_grupo record;
begin
  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    return 0;
  end if;

  -- Só itens desta loja; mais os sub-itens ainda não enviados dos pais pedidos.
  select array_agg(distinct ci.id) into v_ids
    from pdv_comanda_items ci
    join pdv_comandas c on c.id = ci.comanda_id and c.user_id = p_owner
   where ci.id = any(p_item_ids)
      or (ci.parent_item_id = any(p_item_ids) and ci.sent_to_kitchen_at is null);
  if v_ids is null then
    return 0;
  end if;

  update pdv_comanda_items
     set kitchen_status = 'pendente', sent_to_kitchen_at = now()
   where id = any(v_ids);

  for v_grupo in
    select v.comanda_id, v.production_center_id, v.printer_ip,
           coalesce(v.printer_port, 9100) as printer_port,
           jsonb_agg(to_jsonb(v) order by
             -- pais na ordem em que entraram; cada sub-item logo depois do seu pai,
             -- ordenado pela posição (sortParentsThenChildren).
             coalesce(par.created_at, ci.created_at),
             coalesce(v.parent_item_id, v.id),
             v.is_composite_child,
             coalesce(v.composition_position, 2147483647),
             ci.created_at) as linhas
      from vw_print_bridge_comanda_items v
      join pdv_comanda_items ci on ci.id = v.id
      left join pdv_comanda_items par on par.id = v.parent_item_id
     where v.id = any(v_ids)
     group by v.comanda_id, v.production_center_id, v.printer_ip, coalesce(v.printer_port, 9100)
  loop
    insert into pdv_print_jobs
      (tenant_user_id, source_kind, source_item_id, center_id, center_name,
       printer_ip, printer_port, payload, status, error_message)
    select p_owner, 'comanda', (f->>'id')::uuid, (f->>'production_center_id')::uuid,
           f->>'center_name', f->>'printer_ip', v_grupo.printer_port,
           jsonb_build_object(
             'mesa_numero', case when (f->>'is_virtual')::boolean
                                 then coalesce(nullif(f->>'table_number', ''), 'Balcão')
                                 else coalesce(nullif(f->>'table_number', ''), 'AVULSA') end,
             'comanda_nome', coalesce(nullif(f->>'customer_name', ''),
                                      case when f->>'comanda_number' is not null
                                           then 'Comanda ' || (f->>'comanda_number') else 'Comanda' end),
             'is_counter', coalesce((f->>'is_virtual')::boolean, false),
             'comanda_number', f->'comanda_number',
             'customer_name', f->'customer_name',
             'person_number', f->'person_number',
             'table_number', f->'table_number',
             'kind', 'comanda',
             'waiter_name', to_jsonb(p_garcom),
             'order_number', f->'order_number',
             'items', (select jsonb_agg(jsonb_build_object(
                         'product_name', r->'product_name',
                         'quantity', r->'quantity',
                         'notes', r->'notes',
                         'modifiers', r->'modifiers',
                         'parent_product_name', r->'parent_product_name',
                         'is_composite_child', r->'is_composite_child',
                         'composition_group_label', r->'composition_group_label')
                         order by o)
                         from jsonb_array_elements(v_grupo.linhas) with ordinality as y(r, o))),
           case when f->>'printer_ip' is not null then 'pending' else 'failed' end,
           case when f->>'printer_ip' is not null then null else 'sem impressora configurada' end
      from (select v_grupo.linhas->0 as f) primeiro;
    v_jobs := v_jobs + 1;
  end loop;

  return v_jobs;
end;
$$;

create or replace function public.pdv_enviar_cozinha(p_item_ids uuid[])
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_owner  uuid;
  v_donos  int;
  v_garcom text;
begin
  select count(distinct c.user_id), min(c.user_id::text)::uuid
    into v_donos, v_owner
    from pdv_comanda_items ci join pdv_comandas c on c.id = ci.comanda_id
   where ci.id = any(p_item_ids);
  if v_donos = 0 or v_owner is null then
    return 0;
  end if;
  if v_donos > 1 then
    raise exception 'Itens de estabelecimentos diferentes';
  end if;
  if auth.uid() is null or not (auth.uid() = v_owner or is_establishment_member(v_owner)) then
    raise exception 'Sem permissão para enviar estes itens';
  end if;

  -- Nome do garçom no cupom: igual ao app (nome do perfil, senão o e-mail).
  select coalesce(nullif(pr.full_name, ''), u.email) into v_garcom
    from auth.users u left join profiles pr on pr.id = u.id
   where u.id = auth.uid();

  return pdv_enviar_cozinha_interno(v_owner, p_item_ids, v_garcom);
end;
$$;

-- Quem pode chamar o quê. As internas não ficam expostas: só outras funções do
-- banco (as da mesa, na Fase 1) as usam.
revoke all on function public.pdv_centro_do_produto(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pdv_calcular_itens(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.pdv_lancar_itens_interno(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.pdv_enviar_cozinha_interno(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.pdv_lancar_itens(uuid, jsonb) from public, anon;
revoke all on function public.pdv_enviar_cozinha(uuid[]) from public, anon;
grant execute on function public.pdv_lancar_itens(uuid, jsonb) to authenticated;
grant execute on function public.pdv_enviar_cozinha(uuid[]) to authenticated;
