-- Cashback no salão (20/10/2026).
--
-- Pedido de um cliente: ao abrir a mesa, o garçom pede nome e telefone. O TELEFONE gera cashback para a próxima visita
-- (percentual e validade definidos pela loja). No caixa, quem cobra vê o saldo do cliente e ele escolhe usar ou não.
-- Mesa só com nome, sem telefone, não gera cashback.
--
-- Regras decididas pelo dono do Velara:
--   · base = CONSUMO da comanda (itens), sem a taxa de serviço;
--   · o cliente pode usar TODO o saldo, até o valor da conta;
--   · a parte paga com cashback NÃO gera cashback novo;
--   · o cashback usado sai como DESCONTO (inclusive na NFC-e);
--   · o crédito vale a partir da próxima visita (nasce depois que a conta é paga).
--
-- Como funciona:
--   · pdv_settings ganha cashback_ativo, cashback_percentual e cashback_validade_dias.
--   · pdv_cashback_creditos: um crédito por comanda paga com telefone (valor, quanto ainda resta, vencimento).
--   · pdv_cashback_usos: cada uso no caixa, com de quais créditos saiu (os que vencem antes, primeiro); estornável.
--   · O crédito nasce numa rotina de 1 em 1 minuto (pdv_cashback_gerar), não na hora do pagamento: o caixa fecha a
--     comanda pela tela em vários passos, e a rotina lê o resultado final (consumo menos cashback usado, nunca acima do
--     que foi pago de fato no caixa; cortesia de 100% não gera nada).
--   · Telas leem o saldo por pdv_cashback_das_comandas e usam por pdv_cashback_usar / pdv_cashback_estornar_uso.

-- ── configuração por loja ───────────────────────────────────────────────────
alter table public.pdv_settings
  add column if not exists cashback_ativo boolean not null default false,
  add column if not exists cashback_percentual numeric(5,2) not null default 10
    check (cashback_percentual > 0 and cashback_percentual <= 100),
  add column if not exists cashback_validade_dias integer not null default 30
    check (cashback_validade_dias between 1 and 365);

-- ── telefone: só os números, sem o 55 do país; nulo quando não é um celular/fixo com DDD ──
create or replace function public.pdv_telefone_normalizado(p_telefone text)
returns text language sql immutable set search_path = public as $$
  select case when d ~ '^\d{10,11}$' then d end
    from (select case when x ~ '^55\d{10,11}$' then substr(x, 3) else x end as d
            from (select regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') as x) a) b
$$;

-- ── carteira ────────────────────────────────────────────────────────────────
create table if not exists public.pdv_cashback_creditos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  telefone    text not null check (telefone ~ '^\d{10,11}$'),
  nome        text,
  comanda_id  uuid unique references public.pdv_comandas (id) on delete set null,
  base        numeric(12,2) not null check (base >= 0),
  percentual  numeric(5,2) not null,
  valor       numeric(12,2) not null check (valor > 0),
  restante    numeric(12,2) not null check (restante >= 0 and restante <= valor),
  vence_em    date not null,
  criado_em   timestamptz not null default now()
);
create index if not exists pdv_cashback_creditos_tel on public.pdv_cashback_creditos (user_id, telefone, vence_em);

create table if not exists public.pdv_cashback_usos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  telefone      text not null,
  comanda_id    uuid references public.pdv_comandas (id) on delete set null,
  valor         numeric(12,2) not null check (valor > 0),
  alocacao      jsonb not null default '[]'::jsonb,   -- [{credito_id, valor}]
  status        text not null default 'ativo' check (status in ('ativo', 'estornado')),
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  estornado_em  timestamptz
);
create index if not exists pdv_cashback_usos_comanda on public.pdv_cashback_usos (comanda_id) where status = 'ativo';
create index if not exists pdv_cashback_usos_tel on public.pdv_cashback_usos (user_id, telefone);

alter table public.pdv_cashback_creditos enable row level security;
alter table public.pdv_cashback_usos enable row level security;
-- Leitura para a loja (dono e equipe); gravação só pelas funções abaixo.
drop policy if exists cashback_creditos_ler on public.pdv_cashback_creditos;
create policy cashback_creditos_ler on public.pdv_cashback_creditos for select to authenticated
  using (user_id = (select auth.uid()) or is_establishment_member(user_id));
drop policy if exists cashback_usos_ler on public.pdv_cashback_usos;
create policy cashback_usos_ler on public.pdv_cashback_usos for select to authenticated
  using (user_id = (select auth.uid()) or is_establishment_member(user_id));
revoke all on public.pdv_cashback_creditos, public.pdv_cashback_usos from anon, authenticated;
grant select on public.pdv_cashback_creditos, public.pdv_cashback_usos to authenticated;
grant all on public.pdv_cashback_creditos, public.pdv_cashback_usos to service_role;

-- Quem chama pode mexer nesta loja? (dono ou equipe, igual ao lançamento de itens)
create or replace function public.pdv_cashback_pode(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (auth.uid() = p_owner or is_establishment_member(p_owner))
$$;

-- ── saldo das comandas que estão sendo cobradas ─────────────────────────────
-- Para cada comanda: nome, telefone (normalizado) e o saldo disponível hoje, com o vencimento mais próximo.
-- Devolve também se a loja tem o cashback ligado e o percentual (para a tela pedir telefone e estimar o próximo).
create or replace function public.pdv_cashback_das_comandas(p_comanda_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
  v_cfg   record;
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select user_id into v_owner from pdv_comandas where id = any (coalesce(p_comanda_ids, '{}')) limit 1;
  if v_owner is null then return jsonb_build_object('ativo', false, 'comandas', '[]'::jsonb); end if;
  if not pdv_cashback_pode(v_owner) then raise exception 'Sem permissão para ver o cashback desta loja'; end if;
  select cashback_ativo, cashback_percentual, cashback_validade_dias into v_cfg from pdv_settings where user_id = v_owner limit 1;

  return jsonb_build_object(
    'ativo', coalesce(v_cfg.cashback_ativo, false),
    'percentual', coalesce(v_cfg.cashback_percentual, 0),
    'validade_dias', coalesce(v_cfg.cashback_validade_dias, 0),
    'comandas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'comanda_id', c.id,
               'numero', c.comanda_number,
               'nome', c.customer_name,
               'telefone', pdv_telefone_normalizado(c.customer_phone),
               'saldo', coalesce(s.saldo, 0),
               'vence_em', s.vence_em,
               'consumo', coalesce((select sum(i.subtotal) from pdv_comanda_items i where i.comanda_id = c.id and i.parent_item_id is null), 0),
               'usado', coalesce((select sum(u.valor) from pdv_cashback_usos u where u.comanda_id = c.id and u.status = 'ativo'), 0))
             order by c.comanda_number)
        from pdv_comandas c
        left join lateral (
          select sum(cr.restante) as saldo, min(cr.vence_em) as vence_em
            from pdv_cashback_creditos cr
           where cr.user_id = c.user_id and cr.telefone = pdv_telefone_normalizado(c.customer_phone)
             and cr.restante > 0 and cr.vence_em >= v_hoje
        ) s on true
       where c.id = any (p_comanda_ids) and c.user_id = v_owner), '[]'::jsonb));
end $$;

-- ── usar no caixa ───────────────────────────────────────────────────────────
-- Tira p_valor do saldo do telefone da comanda (créditos que vencem antes, primeiro). O valor não passa do saldo nem
-- do consumo do atendimento (todas as comandas da mesma mesa). Uma comanda tem no máximo um uso ativo.
create or replace function public.pdv_cashback_usar(p_comanda_id uuid, p_valor numeric)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_c       record;
  v_tel     text;
  v_valor   numeric(12,2) := round(coalesce(p_valor, 0), 2);
  v_saldo   numeric(12,2);
  v_consumo numeric(12,2);
  v_falta   numeric(12,2);
  v_tira    numeric(12,2);
  v_aloc    jsonb := '[]'::jsonb;
  v_cr      record;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_uso     uuid;
begin
  select * into v_c from pdv_comandas where id = p_comanda_id;
  if v_c.id is null then raise exception 'Comanda não encontrada'; end if;
  if not pdv_cashback_pode(v_c.user_id) then raise exception 'Sem permissão para usar cashback nesta loja'; end if;
  v_tel := pdv_telefone_normalizado(v_c.customer_phone);
  if v_tel is null then raise exception 'Esta comanda não tem telefone para usar cashback'; end if;
  if v_valor <= 0 then raise exception 'Informe o valor de cashback a usar'; end if;
  if exists (select 1 from pdv_cashback_usos where comanda_id = v_c.id and status = 'ativo') then
    raise exception 'O cashback já foi usado nesta comanda';
  end if;

  select coalesce(sum(i.subtotal), 0) into v_consumo
    from pdv_comanda_items i join pdv_comandas c2 on c2.id = i.comanda_id
   where c2.order_id = v_c.order_id and c2.status <> 'cancelada' and i.parent_item_id is null;
  if v_valor > v_consumo then raise exception 'O cashback não pode passar do valor consumido (R$ %)', replace(to_char(v_consumo, 'FM999999990.00'), '.', ','); end if;

  -- trava os créditos do telefone para ninguém usar o mesmo saldo ao mesmo tempo
  select coalesce(sum(restante), 0) into v_saldo from (
    select restante from pdv_cashback_creditos
     where user_id = v_c.user_id and telefone = v_tel and restante > 0 and vence_em >= v_hoje
     for update) s;
  if v_valor > v_saldo then raise exception 'Saldo de cashback insuficiente (disponível R$ %)', replace(to_char(v_saldo, 'FM999999990.00'), '.', ','); end if;

  v_falta := v_valor;
  for v_cr in
    select id, restante from pdv_cashback_creditos
     where user_id = v_c.user_id and telefone = v_tel and restante > 0 and vence_em >= v_hoje
     order by vence_em, criado_em
  loop
    exit when v_falta <= 0;
    v_tira := least(v_cr.restante, v_falta);
    update pdv_cashback_creditos set restante = restante - v_tira where id = v_cr.id;
    v_aloc := v_aloc || jsonb_build_object('credito_id', v_cr.id, 'valor', v_tira);
    v_falta := v_falta - v_tira;
  end loop;

  insert into pdv_cashback_usos (user_id, telefone, comanda_id, valor, alocacao, criado_por)
  values (v_c.user_id, v_tel, v_c.id, v_valor, v_aloc, auth.uid())
  returning id into v_uso;

  return jsonb_build_object('uso_id', v_uso, 'valor', v_valor, 'saldo_restante', v_saldo - v_valor);
end $$;

-- Desfaz um uso (pagamento não concluído): o valor volta para os mesmos créditos.
create or replace function public.pdv_cashback_estornar_uso(p_uso_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_u record; v_a jsonb;
begin
  select * into v_u from pdv_cashback_usos where id = p_uso_id for update;
  if v_u.id is null or v_u.status <> 'ativo' then return false; end if;
  if not pdv_cashback_pode(v_u.user_id) then raise exception 'Sem permissão para estornar cashback nesta loja'; end if;
  for v_a in select * from jsonb_array_elements(v_u.alocacao) loop
    update pdv_cashback_creditos set restante = least(valor, restante + (v_a->>'valor')::numeric)
     where id = (v_a->>'credito_id')::uuid;
  end loop;
  update pdv_cashback_usos set status = 'estornado', estornado_em = now() where id = v_u.id;
  return true;
end $$;

-- ── gerar os créditos (rotina de 1 em 1 minuto) ─────────────────────────────
-- Comanda paga (fechada) nos últimos 2 dias, com telefone válido, de loja com cashback ligado e ainda sem crédito:
-- base = consumo da comanda menos o cashback usado nela, limitada ao que foi pago no caixa por ela (quando o caixa
-- registrou o pagamento ligado à comanda). Espera 1 minuto depois de fechar, para o caixa terminar de gravar.
create or replace function public.pdv_cashback_gerar()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_c       record;
  v_consumo numeric(12,2);
  v_usado   numeric(12,2);
  v_pago    numeric(12,2);
  v_base    numeric(12,2);
  v_valor   numeric(12,2);
  v_n       integer := 0;
begin
  for v_c in
    select c.id, c.user_id, c.customer_name, pdv_telefone_normalizado(c.customer_phone) as tel, c.updated_at,
           s.cashback_percentual as pct, s.cashback_validade_dias as dias
      from pdv_comandas c
      join pdv_settings s on s.user_id = c.user_id and s.cashback_ativo
     where c.status = 'fechada'
       and c.updated_at > now() - interval '2 days'
       and c.updated_at < now() - interval '1 minute'
       and pdv_telefone_normalizado(c.customer_phone) is not null
       and not exists (select 1 from pdv_cashback_creditos cr where cr.comanda_id = c.id)
  loop
    select coalesce(sum(subtotal), 0) into v_consumo from pdv_comanda_items where comanda_id = v_c.id and parent_item_id is null;
    select coalesce(sum(valor), 0) into v_usado from pdv_cashback_usos where comanda_id = v_c.id and status = 'ativo';
    select sum(amount) into v_pago from pdv_cashier_movements where comanda_id = v_c.id and type = 'venda';
    v_base := greatest(0, v_consumo - v_usado);
    if v_pago is not null then v_base := least(v_base, greatest(0, v_pago)); end if;
    v_valor := round(v_base * v_c.pct / 100, 2);
    if v_valor >= 0.01 then
      insert into pdv_cashback_creditos (user_id, telefone, nome, comanda_id, base, percentual, valor, restante, vence_em)
      values (v_c.user_id, v_c.tel, v_c.customer_name, v_c.id, v_base, v_c.pct, v_valor, v_valor,
              (v_c.updated_at at time zone 'America/Sao_Paulo')::date + v_c.dias)
      on conflict (comanda_id) do nothing;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

revoke all on function public.pdv_cashback_pode(uuid), public.pdv_cashback_gerar() from public, anon, authenticated;
grant execute on function public.pdv_cashback_gerar() to service_role;
revoke all on function public.pdv_cashback_das_comandas(uuid[]), public.pdv_cashback_usar(uuid, numeric),
  public.pdv_cashback_estornar_uso(uuid) from public, anon;
grant execute on function public.pdv_cashback_das_comandas(uuid[]), public.pdv_cashback_usar(uuid, numeric),
  public.pdv_cashback_estornar_uso(uuid) to authenticated, service_role;
grant execute on function public.pdv_telefone_normalizado(text) to anon, authenticated, service_role;

-- rotina
select cron.unschedule('velara-cashback-gerar') where exists (select 1 from cron.job where jobname = 'velara-cashback-gerar');
select cron.schedule('velara-cashback-gerar', '* * * * *', $$select public.pdv_cashback_gerar()$$);

notify pgrst, 'reload schema';
