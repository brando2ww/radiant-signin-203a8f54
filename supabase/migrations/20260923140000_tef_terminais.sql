-- Terminais de cartão que atendem a fila da TEF.
--
-- Com a maquininha rodando o app da Velara, o estabelecimento precisa ver no
-- painel quais terminais estão de pé e quando cada um falou pela última vez.
-- Sem isso, "a maquininha não cobra" vira adivinhação.
create table if not exists public.pdv_tef_terminals (
  install_id uuid primary key,
  tenant_user_id uuid not null,
  name text,
  app_version text,
  terminal_serial text,
  logic_number text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_tef_terminals_tenant
  on public.pdv_tef_terminals (tenant_user_id, last_seen_at desc);

alter table public.pdv_tef_terminals enable row level security;

drop policy if exists "membros leem terminais" on public.pdv_tef_terminals;
create policy "membros leem terminais" on public.pdv_tef_terminals for select
  using (tenant_user_id = auth.uid() or public.is_establishment_member(tenant_user_id));

drop policy if exists "sem escrita direta em terminais" on public.pdv_tef_terminals;
create policy "sem escrita direta em terminais" on public.pdv_tef_terminals for insert
  with check (false);

-- ─────────────────────────────────────────────────────────────────────────
-- O app se apresenta e recebe de volta quem é a loja.
-- Serve de validação no cadastro do terminal ("esse código existe?") e de
-- batimento de vida a cada ciclo.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.tef_terminal_registrar(
  p_tenant uuid,
  p_device uuid,
  p_nome text default null,
  p_info jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_nome_loja text;
  v_ativo boolean := false;
  v_provedor text;
begin
  select s.business_name into v_nome_loja
    from public.pdv_settings s where s.user_id = p_tenant limit 1;

  if v_nome_loja is null and not exists (select 1 from public.pdv_settings where user_id = p_tenant) then
    return jsonb_build_object('ok', false, 'motivo', 'estabelecimento_nao_encontrado');
  end if;

  select t.enabled, t.provider into v_ativo, v_provedor
    from public.pdv_tef_settings t where t.user_id = p_tenant;

  insert into public.pdv_tef_terminals (
    install_id, tenant_user_id, name, app_version, terminal_serial, logic_number, last_seen_at
  ) values (
    p_device, p_tenant, nullif(btrim(coalesce(p_nome, '')), ''),
    p_info->>'app_version', p_info->>'serial', p_info->>'logic_number', now()
  )
  on conflict (install_id) do update
    set tenant_user_id = excluded.tenant_user_id,
        name = coalesce(excluded.name, public.pdv_tef_terminals.name),
        app_version = coalesce(excluded.app_version, public.pdv_tef_terminals.app_version),
        terminal_serial = coalesce(excluded.terminal_serial, public.pdv_tef_terminals.terminal_serial),
        logic_number = coalesce(excluded.logic_number, public.pdv_tef_terminals.logic_number),
        last_seen_at = now();

  return jsonb_build_object(
    'ok', true,
    'estabelecimento', coalesce(v_nome_loja, 'Estabelecimento'),
    'tef_ativo', coalesce(v_ativo, false),
    'provedor', v_provedor
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Últimas cobranças deste terminal, para a tela do app.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.tef_terminal_ultimas(
  p_tenant uuid,
  p_device uuid,
  p_limit integer default 6
) returns jsonb
language sql security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x.quando desc), '[]'::jsonb) from (
    select r.id,
           r.amount as valor,
           r.status,
           coalesce(r.finished_at, r.created_at) as quando,
           r.result->>'bandeira' as bandeira,
           r.result->>'nsu' as nsu
      from public.pdv_tef_requests r
     where r.tenant_user_id = p_tenant
       and (r.install_id = p_device or r.claimed_by = p_device::text)
       and r.operation = 'venda'
     order by coalesce(r.finished_at, r.created_at) desc
     limit greatest(coalesce(p_limit, 6), 1)
  ) x;
$$;

grant execute on function public.tef_terminal_registrar(uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.tef_terminal_ultimas(uuid, uuid, integer) to anon, authenticated;
