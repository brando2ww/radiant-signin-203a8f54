-- Contagem de estoque: dois defeitos achados ao diagnosticar o link público.
--
-- 1. O freio de força bruta nunca freava. Na senha errada o código fazia
--    `update ... failed_attempts + 1` e logo em seguida `raise exception`.
--    RAISE aborta a transação, então o incremento voltava atrás junto: o
--    contador ficava eternamente em zero e o bloqueio de 5 tentativas nunca
--    disparava. Agora a falha de credencial RETORNA um erro em vez de levantar,
--    o que preserva a escrita.
--
-- 2. Senha perdida era beco sem saída. O hash não é reversível — de propósito —
--    mas não havia como trocar a senha de um link existente, então o gestor
--    tinha que abrir outra contagem inteira e descartar o que já tinha sido
--    contado. Agora dá para gerar uma senha nova no mesmo link.

-- ---------------------------------------------------------------------------
-- 1. Abertura: falha de credencial deixa de abortar a transação
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
    -- Resposta idêntica para token inexistente e senha errada: distinguir os
    -- dois entrega ao atacante que o token existe.
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
    -- Retorno, e não RAISE: o incremento acima precisa sobreviver.
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
-- 2. Trocar a senha de um link existente
-- ---------------------------------------------------------------------------

-- Senha perdida não pode custar a contagem inteira: o que já foi contado fica,
-- só o acesso é renovado. Também zera o bloqueio e estende a validade.
create or replace function public.pdv_stock_count_reset_link(
  _link_id uuid,
  _password text,
  _expires_hours int default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if coalesce(_password, '') = '' then
    raise exception 'password_required';
  end if;
  v_owner := public.pdv_resolve_owner(auth.uid());

  update public.pdv_stock_count_links
     set password_hash = crypt(_password, gen_salt('bf')),
         failed_attempts = 0,
         locked_until = null,
         expires_at = now() + make_interval(hours => greatest(1, coalesce(_expires_hours, 24)))
   where id = _link_id and user_id = v_owner
  returning token into v_token;

  if v_token is null then
    raise exception 'link_not_found';
  end if;

  return jsonb_build_object('token', v_token);
end;
$$;

grant execute on function public.pdv_stock_count_reset_link(uuid, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Limpeza das sondas de diagnóstico
-- ---------------------------------------------------------------------------

drop function if exists public.pdv_stock_count_probe();
drop function if exists public.pdv_stock_count_open_diag(uuid, text);
drop function if exists public.pdv_stock_count_probe_link();
delete from public.pdv_stock_count_links where label = '__diagnostico__';
