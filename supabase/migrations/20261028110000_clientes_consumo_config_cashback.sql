-- Consulta de consumo por canal e configuração de cashback do estabelecimento.
-- Não ativa programas nem cria créditos retroativos ao publicar.
begin;

alter table public.pdv_settings add column if not exists cashback_inicio_em timestamptz;

create or replace function public.pdv_cashback_pode_configurar(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() = p_owner or exists (
      select 1 from public.establishment_users e
       where e.user_id = auth.uid() and e.establishment_owner_id = p_owner
         and e.is_active and e.role::text in ('proprietario', 'gerente')
    )
  )
$$;

create or replace function public.pdv_cashback_configuracao(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cfg record;
begin
  if not public.pdv_cashback_pode(p_owner) then
    raise exception 'Sem permissão para consultar esta loja' using errcode = '42501';
  end if;
  select cashback_ativo, cashback_percentual, cashback_validade_dias, cashback_inicio_em
    into v_cfg from public.pdv_settings where user_id = p_owner;
  return jsonb_build_object(
    'ativo', coalesce(v_cfg.cashback_ativo, false),
    'percentual', coalesce(v_cfg.cashback_percentual, 10),
    'validade_dias', coalesce(v_cfg.cashback_validade_dias, 30),
    'inicio_em', v_cfg.cashback_inicio_em,
    'pode_configurar', public.pdv_cashback_pode_configurar(p_owner));
end $$;

create or replace function public.pdv_cashback_configurar(
  p_owner uuid, p_ativo boolean, p_percentual numeric, p_validade_dias integer
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.pdv_cashback_pode_configurar(p_owner) then
    raise exception 'Somente o proprietário ou gerente pode configurar o cashback' using errcode = '42501';
  end if;
  if p_ativo is null or p_percentual is null or p_percentual <= 0 or p_percentual > 100
     or p_validade_dias is null or p_validade_dias < 1 or p_validade_dias > 365 then
    raise exception 'Informe percentual entre 0,01 e 100 e validade entre 1 e 365 dias' using errcode = '22023';
  end if;
  insert into public.pdv_settings (user_id, cashback_ativo, cashback_percentual, cashback_validade_dias, cashback_inicio_em)
    values (p_owner, p_ativo, p_percentual, p_validade_dias, case when p_ativo then now() end)
  on conflict (user_id) do update set
    cashback_ativo = excluded.cashback_ativo,
    cashback_percentual = excluded.cashback_percentual,
    cashback_validade_dias = excluded.cashback_validade_dias,
    cashback_inicio_em = case
      when excluded.cashback_ativo and not pdv_settings.cashback_ativo then now()
      else pdv_settings.cashback_inicio_em end;
  return public.pdv_cashback_configuracao(p_owner);
end $$;

-- Quem altera a configuração pela tela antiga segue a mesma data de início.
create or replace function public.pdv_cashback_marcar_inicio()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cashback_ativo and (tg_op = 'INSERT' or not old.cashback_ativo) then
    new.cashback_inicio_em := now();
  end if;
  return new;
end $$;
drop trigger if exists pdv_cashback_inicio on public.pdv_settings;
create trigger pdv_cashback_inicio before insert or update of cashback_ativo on public.pdv_settings
  for each row execute function public.pdv_cashback_marcar_inicio();

-- O valor e a baixa continuam nas rotinas existentes. A ativação só alcança contas pagas a partir dela.
create or replace function public.pdv_cashback_gerar()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_c record;
  v_consumo numeric(12,2);
  v_usado numeric(12,2);
  v_pago numeric(12,2);
  v_base numeric(12,2);
  v_valor numeric(12,2);
  v_n integer := 0;
  v_inseridos integer;
begin
  for v_c in
    select c.id, c.user_id, c.customer_name, public.pdv_telefone_normalizado(c.customer_phone) as tel, c.updated_at,
           s.cashback_percentual as pct, s.cashback_validade_dias as dias
      from public.pdv_comandas c
      join public.pdv_settings s on s.user_id = c.user_id and s.cashback_ativo
     where c.status = 'fechada'
       and c.updated_at > now() - interval '2 days'
       and c.updated_at < now() - interval '1 minute'
       and (s.cashback_inicio_em is null or c.updated_at >= s.cashback_inicio_em)
       and public.pdv_telefone_normalizado(c.customer_phone) is not null
       and not exists (select 1 from public.pdv_cashback_creditos cr where cr.comanda_id = c.id)
  loop
    select coalesce(sum(subtotal), 0) into v_consumo from public.pdv_comanda_items where comanda_id = v_c.id and parent_item_id is null;
    select coalesce(sum(valor), 0) into v_usado from public.pdv_cashback_usos where comanda_id = v_c.id and status = 'ativo';
    select sum(amount) into v_pago from public.pdv_cashier_movements where comanda_id = v_c.id and type = 'venda';
    v_base := greatest(0, v_consumo - v_usado);
    if v_pago is not null then v_base := least(v_base, greatest(0, v_pago)); end if;
    v_valor := round(v_base * v_c.pct / 100, 2);
    if v_valor >= 0.01 then
      insert into public.pdv_cashback_creditos (user_id, telefone, nome, comanda_id, base, percentual, valor, restante, vence_em)
      values (v_c.user_id, v_c.tel, v_c.customer_name, v_c.id, v_base, v_c.pct, v_valor, v_valor,
              (v_c.updated_at at time zone 'America/Sao_Paulo')::date + v_c.dias)
      on conflict (comanda_id) do nothing;
      get diagnostics v_inseridos = row_count;
      v_n := v_n + v_inseridos;
    end if;
  end loop;
  return v_n;
end $$;

-- Histórico das comandas, que não têm customer_id, associado pelo telefone da própria loja.
-- Mantém separados os canais e evita contar novamente o pedido-pai de uma comanda.
create or replace function public.pdv_clientes_consumos(p_owner uuid)
returns table(telefone text, canal text, referencia uuid, numero text, data_consumo timestamptz, valor numeric, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pdv_cashback_pode(p_owner) then
    raise exception 'Sem permissão para consultar clientes desta loja' using errcode = '42501';
  end if;
  return query
    select public.pdv_telefone_normalizado(c.customer_phone), 'pdv'::text, c.id,
           c.comanda_number::text, c.updated_at, c.subtotal::numeric, c.status::text
      from public.pdv_comandas c
     where c.user_id = p_owner and c.status = 'fechada'
       and public.pdv_telefone_normalizado(c.customer_phone) is not null
    union all
    select public.pdv_telefone_normalizado(cl.phone), 'pdv'::text, o.id,
           o.order_number::text, o.updated_at, coalesce(o.total, 0)::numeric, o.status::text
      from public.pdv_orders o join public.pdv_customers cl on cl.id = o.customer_id and cl.user_id = p_owner
     where o.user_id = p_owner and o.status in ('fechada', 'fechado', 'closed')
       and public.pdv_telefone_normalizado(cl.phone) is not null
       and not exists (select 1 from public.pdv_comandas c where c.order_id = o.id and c.user_id = p_owner)
    union all
    select public.pdv_telefone_normalizado(o.customer_phone), 'delivery'::text, o.id,
           o.order_number::text, coalesce(o.delivered_at, o.updated_at), o.total::numeric, o.status::text
      from public.delivery_orders o
     where o.user_id = p_owner and o.status in ('completed', 'delivered') and o.payment_status = 'paid'
       and public.pdv_telefone_normalizado(o.customer_phone) is not null;
end $$;

create or replace function public.pdv_clientes_creditos(p_owner uuid)
returns table(id uuid, telefone text, valor numeric, restante numeric, vence_em date, criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pdv_cashback_pode(p_owner) then
    raise exception 'Sem permissão para consultar cashback desta loja' using errcode = '42501';
  end if;
  return query select cr.id, cr.telefone, cr.valor, cr.restante, cr.vence_em, cr.criado_em
    from public.pdv_cashback_creditos cr where cr.user_id = p_owner;
end $$;

revoke all on function public.pdv_cashback_pode_configurar(uuid), public.pdv_cashback_marcar_inicio() from public, anon, authenticated;
revoke all on function public.pdv_cashback_configuracao(uuid), public.pdv_cashback_configurar(uuid, boolean, numeric, integer),
  public.pdv_clientes_consumos(uuid), public.pdv_clientes_creditos(uuid) from public, anon;
grant execute on function public.pdv_cashback_configuracao(uuid), public.pdv_cashback_configurar(uuid, boolean, numeric, integer),
  public.pdv_clientes_consumos(uuid), public.pdv_clientes_creditos(uuid) to authenticated, service_role;
revoke all on function public.pdv_cashback_gerar() from public, anon, authenticated;
grant execute on function public.pdv_cashback_gerar() to service_role;
notify pgrst, 'reload schema';
commit;
