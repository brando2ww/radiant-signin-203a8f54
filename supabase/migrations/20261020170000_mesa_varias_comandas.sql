-- Mesa Digital · várias comandas na mesma mesa pelo QR (20/10/2026).
--
-- Pedido do dono: a mesa pode ter várias comandas (uma por pessoa ou grupo). Quem lê o QR de uma mesa que já tem
-- comanda aberta vê a lista das comandas abertas e escolhe: entra numa delas (vê o consumo e pede de novo) ou abre
-- uma comanda nova na mesma mesa. Entrar numa comanda é direto (sem código). Cada um fecha a sua: pedir a conta numa
-- comanda não impede outra pessoa de abrir uma comanda nova na mesa.
--
-- · mesa_comandas(token, mesa): a mesa e as comandas abertas dela (nome curto de quem abriu, número, itens, total).
-- · mesa_entrar ganha p_comanda_id (entrar nessa comanda) e p_nova (abrir comanda nova). Sem os dois, faz o de antes
--   (entra na primeira comanda aberta; mesa fechando a conta não recebe ninguém), para a página antiga em cache.
-- · pdv_abrir_atendimento_interno ganha os mesmos dois parâmetros (só a mesa_entrar usa esta função).

drop function if exists public.pdv_abrir_atendimento_interno(uuid, uuid, text, text, text);
create function public.pdv_abrir_atendimento_interno(
  p_owner uuid, p_table_id uuid, p_nome text, p_telefone text, p_origem text,
  p_comanda_id uuid default null, p_nova boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_mesa      record;
  v_order     uuid;
  v_comanda   uuid;
  v_status    text;
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
    -- Entrar numa comanda escolhida na lista: precisa ser desta mesa e estar aberta.
    if p_comanda_id is not null then
      select id, status into v_comanda, v_status from pdv_comandas where id = p_comanda_id and order_id = v_order;
      if v_comanda is null then raise exception 'comanda_invalida'; end if;
      if v_status <> 'aberta' then raise exception 'comanda_fechando'; end if;
      return jsonb_build_object('order_id', v_order, 'comanda_id', v_comanda, 'nova', false);
    end if;

    if not coalesce(p_nova, false) then
      -- Quem não escolheu (página antiga): mesa fechando a conta não recebe gente nova; entra na 1ª comanda aberta.
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
    end if;
    -- Comanda nova na mesma mesa: segue para a criação abaixo, no atendimento que já está aberto.
  else
    if p_comanda_id is not null then raise exception 'comanda_invalida'; end if;
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
$function$;
revoke all on function public.pdv_abrir_atendimento_interno(uuid, uuid, text, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.pdv_abrir_atendimento_interno(uuid, uuid, text, text, text, uuid, boolean) to service_role;

-- A mesa do QR (ou a escolhida no QR geral) e as comandas abertas dela, para a pessoa escolher onde entrar.
-- Nome curto ("Felipe", "Ana S."): o suficiente para reconhecer, sem expor o nome inteiro de quem está na mesa.
create or replace function public.mesa_comandas(p_token text, p_table_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_qr    record;
  v_mesa  record;
  v_order uuid;
begin
  select q.id, q.user_id, q.tipo, q.table_id, q.ativo into v_qr from mesa_qr_codes q where q.token = lower(trim(p_token));
  if v_qr.id is null then return jsonb_build_object('error', 'qr_invalido'); end if;
  if not v_qr.ativo then return jsonb_build_object('error', 'qr_desativado'); end if;
  if not mesa_tem_modulo(v_qr.user_id) then return jsonb_build_object('error', 'modulo_inativo'); end if;

  select id, table_number, current_order_id into v_mesa from pdv_tables
   where id = case when v_qr.tipo = 'mesa' then v_qr.table_id else p_table_id end
     and user_id = v_qr.user_id and is_active and deleted_at is null and not coalesce(is_virtual, false);
  if v_mesa.id is null then return jsonb_build_object('error', 'mesa_invalida'); end if;

  if v_mesa.current_order_id is not null then
    select id into v_order from pdv_orders where id = v_mesa.current_order_id and status in ('aberta', 'aberto');
  end if;

  return jsonb_build_object(
    'mesa', jsonb_build_object('id', v_mesa.id, 'numero', v_mesa.table_number),
    'comandas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'numero', c.comanda_number,
               'nome', case when nullif(btrim(c.customer_name), '') is null then null
                            when array_length(regexp_split_to_array(btrim(c.customer_name), '\s+'), 1) = 1 then initcap(btrim(c.customer_name))
                            else initcap(split_part(btrim(c.customer_name), ' ', 1)) || ' ' ||
                                 upper(left((regexp_split_to_array(btrim(c.customer_name), '\s+'))[array_length(regexp_split_to_array(btrim(c.customer_name), '\s+'), 1)], 1)) || '.'
                       end,
               'itens', (select count(*) from pdv_comanda_items i where i.comanda_id = c.id and i.parent_item_id is null),
               'total', coalesce(c.subtotal, 0),
               'fechando', c.status <> 'aberta')
             order by c.created_at, c.comanda_number)
        from pdv_comandas c
       where c.order_id = v_order and c.status in ('aberta', 'aguardando_pagamento', 'em_cobranca')), '[]'::jsonb));
end $function$;
revoke all on function public.mesa_comandas(text, uuid) from public;
grant execute on function public.mesa_comandas(text, uuid) to anon, authenticated, service_role;

-- Entrar: igual à de antes, mais a escolha (entrar numa comanda da lista ou abrir uma nova).
drop function if exists public.mesa_entrar(text, uuid, text, text, text);
create function public.mesa_entrar(
  p_token text, p_table_id uuid, p_nome text, p_celular text, p_user_agent text default null,
  p_comanda_id uuid default null, p_nova boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
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
    v_at := pdv_abrir_atendimento_interno(v_qr.user_id, v_mesa, v_nome, v_cel, 'qr', p_comanda_id, coalesce(p_nova, false));
  exception when others then
    if sqlerrm like 'Caixa fechado%' then return jsonb_build_object('error', 'caixa_fechado'); end if;
    if sqlerrm in ('mesa_invalida', 'conta_em_fechamento', 'comanda_invalida', 'comanda_fechando') then
      return jsonb_build_object('error', sqlerrm);
    end if;
    raise;
  end;

  insert into mesa_sessoes (user_id, qr_code_id, table_id, order_id, comanda_id, nome, celular, expira_em, user_agent)
  values (v_qr.user_id, v_qr.id, v_mesa, (v_at->>'order_id')::uuid, (v_at->>'comanda_id')::uuid,
          v_nome, v_cel, now() + make_interval(hours => v_qr.horas), left(p_user_agent, 300))
  returning * into v_sessao;

  return jsonb_build_object('sessao', v_sessao.token, 'nome', v_nome,
    'mesa', (select table_number from pdv_tables where id = v_mesa));
end 
$function$;
revoke all on function public.mesa_entrar(text, uuid, text, text, text, uuid, boolean) from public;
grant execute on function public.mesa_entrar(text, uuid, text, text, text, uuid, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
