-- TEF: o caixa manda o valor para a maquininha e recebe a resposta de volta.
--
-- Por que passa pela ponte de impressão e não direto do navegador: navegador
-- não fala com pinpad. Quem fala é um programa rodando no computador da loja, e
-- a Velara já tem um instalado e cuidado (o Print Bridge, com fila,
-- reivindicação com lease, reconexão e painel). A TEF entra no mesmo trilho:
-- o PDV cria um pedido aqui, a ponte reivindica, conversa com a máquina e
-- devolve o resultado na mesma linha.
--
-- O provedor fica isolado num adaptador dentro da ponte, porque quem fala com a
-- Getnet na prática é o TEF instalado na loja (Getnet local, ConnectTEF, PayGo
-- ou SiTef, conforme o contrato do estabelecimento). Trocar de provedor não
-- muda nada do que está neste arquivo nem na tela do caixa.

create table if not exists public.pdv_tef_settings (
  user_id uuid primary key,
  enabled boolean not null default false,
  -- 'bridge' = pinpad na loja pela ponte · 'getnet_cloud' = terminal acordado
  -- pela nuvem da Getnet (exige contrato de POS Integrado)
  provider text not null default 'bridge',
  install_id uuid,
  terminal_label text,
  timeout_seconds integer not null default 120,
  -- Nuvem: preenchido só quando provider = 'getnet_cloud'
  getnet_base_url text,
  getnet_client_id text,
  getnet_secret_cifrado text,
  getnet_terminal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pdv_tef_settings enable row level security;

drop policy if exists "tef settings read" on public.pdv_tef_settings;
create policy "tef settings read" on public.pdv_tef_settings for select
  using (user_id = auth.uid() or public.is_establishment_member(user_id));

drop policy if exists "tef settings write" on public.pdv_tef_settings;
create policy "tef settings write" on public.pdv_tef_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- Fila de operações na maquininha
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.pdv_tef_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_user_id uuid not null,
  install_id uuid,
  operation text not null check (operation in ('venda','cancelamento','reimpressao','teste')),
  amount numeric not null default 0,
  payment_type text check (payment_type in ('credito','debito','voucher','pix')),
  installments integer not null default 1,
  financing text check (financing in ('avista','loja','emissor')),
  status text not null default 'pending'
    check (status in ('pending','processing','approved','denied','cancelled','error','expired')),
  claimed_at timestamptz,
  claimed_by text,
  finished_at timestamptz,
  -- nsu, autorização, bandeira, final do cartão e as vias para impressão
  result jsonb,
  error_message text,
  source_kind text,
  source_id uuid,
  original_request_id uuid,
  requested_by uuid,
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);

create index if not exists idx_tef_requests_fila
  on public.pdv_tef_requests (tenant_user_id, status, created_at desc);
create index if not exists idx_tef_requests_install
  on public.pdv_tef_requests (install_id, status) where status = 'pending';

alter table public.pdv_tef_requests enable row level security;

drop policy if exists "tef requests read" on public.pdv_tef_requests;
create policy "tef requests read" on public.pdv_tef_requests for select
  using (tenant_user_id = auth.uid() or public.is_establishment_member(tenant_user_id));

-- Insert só pela RPC, que confere a permissão de receber pagamento.
drop policy if exists "tef requests no direct insert" on public.pdv_tef_requests;
create policy "tef requests no direct insert" on public.pdv_tef_requests for insert
  with check (false);

-- ─────────────────────────────────────────────────────────────────────────
-- RPC do caixa: pede a operação
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.pdv_tef_solicitar(
  p_operation text,
  p_amount numeric default 0,
  p_payment_type text default null,
  p_installments integer default 1,
  p_financing text default 'avista',
  p_source_kind text default null,
  p_source_id uuid default null,
  p_original_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_cfg record;
  v_id uuid;
begin
  v_owner := public.pdv_resolve_owner(v_actor);
  if v_owner is null then
    raise exception 'Usuário sem estabelecimento';
  end if;

  if not public.has_pdv_action(v_actor, 'process_payment') then
    raise exception 'Sem permissão para receber pagamento';
  end if;

  select * into v_cfg from public.pdv_tef_settings where user_id = v_owner;
  if not found or not v_cfg.enabled then
    raise exception 'TEF não está ativo neste estabelecimento';
  end if;

  if p_operation = 'venda' and coalesce(p_amount, 0) <= 0 then
    raise exception 'Valor inválido para a maquininha';
  end if;

  insert into public.pdv_tef_requests (
    tenant_user_id, install_id, operation, amount, payment_type, installments,
    financing, source_kind, source_id, original_request_id, requested_by,
    expires_at
  ) values (
    v_owner,
    case when v_cfg.provider = 'bridge' then v_cfg.install_id else null end,
    p_operation, coalesce(p_amount, 0), p_payment_type, greatest(coalesce(p_installments, 1), 1),
    coalesce(p_financing, 'avista'), p_source_kind, p_source_id, p_original_request_id, v_actor,
    now() + make_interval(secs => greatest(v_cfg.timeout_seconds, 30))
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'request_id', v_id, 'provider', v_cfg.provider);
end;
$$;

revoke all on function public.pdv_tef_solicitar(text, numeric, text, integer, text, text, uuid, uuid) from public;
grant execute on function public.pdv_tef_solicitar(text, numeric, text, integer, text, text, uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RPCs da ponte (mesmo modelo de confiança do print_bridge_claim_batch)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.tef_bridge_claim_batch(
  p_tenant uuid,
  p_device text,
  p_limit integer default 3
) returns setof public.pdv_tef_requests
language plpgsql security definer set search_path = public
as $$
begin
  return query
  with alvo as (
    select r.id
      from public.pdv_tef_requests r
     where r.tenant_user_id = p_tenant
       and r.status = 'pending'
       and r.expires_at > now()
       and (r.install_id is null or r.install_id::text = p_device)
     order by r.created_at
     limit greatest(coalesce(p_limit, 3), 1)
     for update skip locked
  )
  update public.pdv_tef_requests r
     set status = 'processing', claimed_at = now(), claimed_by = p_device
    from alvo
   where r.id = alvo.id
  returning r.*;
end;
$$;

create or replace function public.tef_bridge_finish(
  p_request_id uuid,
  p_status text,
  p_result jsonb default null,
  p_error text default null
) returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.pdv_tef_requests
     set status = p_status,
         result = coalesce(p_result, result),
         error_message = nullif(btrim(coalesce(p_error, '')), ''),
         finished_at = now()
   where id = p_request_id
     and status in ('pending', 'processing');
  return found;
end;
$$;

grant execute on function public.tef_bridge_claim_batch(uuid, text, integer) to anon, authenticated;
grant execute on function public.tef_bridge_finish(uuid, text, jsonb, text) to anon, authenticated;

-- Pedido que ninguém pegou (ponte fora do ar) não pode ficar girando para
-- sempre na tela do caixa.
create or replace function public.pdv_tef_expirar_pendentes()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_qtd integer;
begin
  update public.pdv_tef_requests
     set status = 'expired',
         error_message = coalesce(error_message, 'A maquininha não respondeu no tempo esperado'),
         finished_at = now()
   where status in ('pending', 'processing')
     and expires_at < now();
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;
