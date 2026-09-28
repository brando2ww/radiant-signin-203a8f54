-- Módulo de Ponto · fase 2: escala, regras de jornada, tratamento, fechamento,
-- banco de horas e exportação para folha.
--
-- Decisões que atravessam tudo:
--
--  * A marcação continua intocável. Correção NUNCA edita a marcação: nasce
--    como linha em ponto_tratamentos, com motivo e autor (art. 82 da Portaria
--    671). O espelho mostra as duas camadas.
--
--  * Nenhum percentual fica no código. O perfil de jornada nasce com o piso da
--    CLT (50% de extra, 20% de noturno) e VIGÊNCIA, para quando a convenção
--    coletiva do cliente chegar o passado não ser recalculado com a regra nova.
--
--  * O fechamento guarda TOTAIS NOMEADOS, não um par fixo de colunas: hora
--    extra é por faixa configurável, e cada convenção tem as suas.

-- ---------------------------------------------------------------------------
-- 1. Quiosque: o tablet do salão
-- ---------------------------------------------------------------------------
--
-- Resolve três coisas de uma vez: cozinha sem sinal de celular, funcionário
-- sem smartphone, e o iPhone que pede permissão de câmera a cada batida.
-- O aparelho é do restaurante; quem se identifica é a pessoa, por PIN.

alter table public.ponto_colaboradores
  add column if not exists pin_hash text;

create table if not exists public.ponto_quiosques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  token uuid not null default gen_random_uuid() unique,
  local_id uuid references public.ponto_locais(id),
  ativo boolean not null default true,
  ultimo_uso_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table public.ponto_quiosques enable row level security;

drop policy if exists ponto_quiosques_gestor on public.ponto_quiosques;
create policy ponto_quiosques_gestor on public.ponto_quiosques
  for all to authenticated
  using ((auth.uid() = user_id or public.is_establishment_member(user_id)) and public.ponto_tem_modulo(user_id))
  with check ((auth.uid() = user_id or public.is_establishment_member(user_id)) and public.ponto_tem_modulo(user_id));

-- ---------------------------------------------------------------------------
-- 2. Escala
-- ---------------------------------------------------------------------------
--
-- Jornada prevista é POR DIA, não carga semanal: sem isso toda 6x1 com sábado
-- curto erra, e a tolerância do art. 58 §1º compara justamente com o previsto.

create table if not exists public.ponto_escalas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  colaborador_id uuid not null references public.ponto_colaboradores(id) on delete cascade,
  nome text,
  regime text not null default 'normal' check (regime in ('normal', '12x36', 'intermitente')),
  vigencia_inicio date not null,
  vigencia_fim date,
  publicada_em timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists public.ponto_escala_dias (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null references public.ponto_escalas(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  entrada text,
  saida text,
  intervalo_min int not null default 0,
  is_dsr boolean not null default false,
  unique (escala_id, dia_semana)
);

create index if not exists idx_ponto_escalas_colab
  on public.ponto_escalas (colaborador_id, vigencia_inicio desc);

-- ---------------------------------------------------------------------------
-- 3. Perfil de jornada (o lugar da convenção coletiva)
-- ---------------------------------------------------------------------------

create table if not exists public.ponto_perfis_jornada (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null default 'Piso da CLT',
  vigencia_inicio date not null default '2020-01-01',
  vigencia_fim date,
  -- Faixas de hora extra: [{ "ate_horas": 2, "pct": 50 }, { "pct": 50 }].
  -- O piso da CLT é 50% para tudo; a convenção do setor costuma escalonar.
  faixas_extra jsonb not null default '[{"pct": 50}]'::jsonb,
  pct_domingo_feriado numeric not null default 100,
  pct_noturno numeric not null default 20,
  noturno_inicio time not null default '22:00',
  noturno_fim time not null default '05:00',
  -- Hora noturna reduzida de 52min30s (art. 73 §1º da CLT).
  noturno_hora_reduzida boolean not null default true,
  noturno_prorrogacao boolean not null default true,
  intrajornada_min_min int not null default 60,
  tolerancia_extremo_min int not null default 5,
  tolerancia_dia_min int not null default 10,
  periodo_banco text not null default 'semestral'
    check (periodo_banco in ('mensal', 'quadrimestral', 'semestral', 'anual')),
  banco_desconta_saldo_devedor boolean not null default false,
  documento_url text,
  observacao text,
  criado_em timestamptz not null default now()
);

comment on table public.ponto_perfis_jornada is
  'Regras de cálculo por estabelecimento, com vigência. Nasce com o piso da CLT; a convenção coletiva do cliente entra aqui quando chegar, sem recalcular o passado.';

create table if not exists public.ponto_feriados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  data date not null,
  nome text not null,
  escopo text not null default 'nacional' check (escopo in ('nacional', 'estadual', 'municipal')),
  uf text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_ponto_feriados_data on public.ponto_feriados (data);

-- ---------------------------------------------------------------------------
-- 4. Tratamento: a correção que não apaga nada
-- ---------------------------------------------------------------------------

create table if not exists public.ponto_tratamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  colaborador_id uuid not null references public.ponto_colaboradores(id) on delete cascade,
  marcacao_id uuid references public.ponto_marcacoes(id),
  dia_jornada date not null,
  tipo text not null check (tipo in ('inclusao', 'desconsideracao', 'ausencia', 'abono', 'banco_horas')),
  -- fonte da marcação no vocabulário do AEJ: O original, I incluída, P
  -- pré-assinalada, X exceção.
  fonte_marc text not null default 'I' check (fonte_marc in ('O', 'I', 'P', 'X')),
  horario timestamptz,
  minutos int,
  motivo text not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  solicitado_por uuid,
  solicitado_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_em timestamptz,
  decisao_motivo text
);

create index if not exists idx_ponto_trat_colab_dia
  on public.ponto_tratamentos (colaborador_id, dia_jornada);

comment on table public.ponto_tratamentos is
  'Ajuste de ponto. A marcação original nunca muda: o que existe aqui é uma camada por cima, com motivo e autor (art. 82 da Portaria 671/2021).';

-- ---------------------------------------------------------------------------
-- 5. Fechamento do mês
-- ---------------------------------------------------------------------------

create table if not exists public.ponto_fechamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competencia date not null,
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  perfil_id uuid references public.ponto_perfis_jornada(id),
  fechado_por uuid,
  fechado_em timestamptz,
  reaberto_por uuid,
  reaberto_em timestamptz,
  reabertura_motivo text,
  criado_em timestamptz not null default now(),
  unique (user_id, competencia)
);

create table if not exists public.ponto_totais (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.ponto_fechamentos(id) on delete cascade,
  colaborador_id uuid not null references public.ponto_colaboradores(id),
  rubrica text not null,
  minutos int not null default 0,
  dias numeric not null default 0,
  detalhe jsonb,
  unique (fechamento_id, colaborador_id, rubrica)
);

comment on table public.ponto_totais is
  'Resultado do mês como totais NOMEADOS. Hora extra é por faixa configurável, então não existe coluna fixa de 50% e 100%.';

-- ---------------------------------------------------------------------------
-- 6. Banco de horas · livro-caixa com validade
-- ---------------------------------------------------------------------------

create table if not exists public.ponto_banco_lancamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  colaborador_id uuid not null references public.ponto_colaboradores(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('credito', 'debito', 'compensacao', 'quitacao', 'expiracao')),
  minutos int not null,
  expira_em date,
  origem text not null default 'fechamento',
  fechamento_id uuid references public.ponto_fechamentos(id) on delete set null,
  observacao text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_ponto_banco_colab
  on public.ponto_banco_lancamentos (colaborador_id, data);

-- ---------------------------------------------------------------------------
-- 7. Exportação para a folha
-- ---------------------------------------------------------------------------

create table if not exists public.ponto_export_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  preset text not null default 'custom' check (preset in ('alterdata', 'sage_iob', 'csv', 'custom')),
  formato_hora text not null default 'minutos'
    check (formato_hora in ('minutos', 'sexagesimal', 'decimal', 'decimal_implicito')),
  codigo_empresa text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.ponto_export_eventos (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.ponto_export_layouts(id) on delete cascade,
  rubrica text not null,
  codigo_contador text not null,
  unique (layout_id, rubrica)
);

comment on table public.ponto_export_eventos is
  'De/para entre a rubrica do Velara e o código de evento do escritório de contabilidade. O código é do contador, não nosso: sem ele preenchido, a exportação não gera arquivo.';

-- ---------------------------------------------------------------------------
-- 8. RLS das tabelas novas
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'ponto_escalas', 'ponto_perfis_jornada', 'ponto_feriados', 'ponto_tratamentos',
    'ponto_fechamentos', 'ponto_banco_lancamentos', 'ponto_export_layouts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      drop policy if exists %1$s_gestor on public.%1$s;
      create policy %1$s_gestor on public.%1$s
        for all to authenticated
        using (
          (auth.uid() = user_id or public.is_establishment_member(user_id))
          and public.ponto_tem_modulo(user_id)
        )
        with check (
          (auth.uid() = user_id or public.is_establishment_member(user_id))
          and public.ponto_tem_modulo(user_id)
        );
    $f$, t);
  end loop;
end
$$;

-- Tabelas-filhas: seguem o dono pela tabela-mãe.
alter table public.ponto_escala_dias enable row level security;
drop policy if exists ponto_escala_dias_gestor on public.ponto_escala_dias;
create policy ponto_escala_dias_gestor on public.ponto_escala_dias
  for all to authenticated
  using (exists (
    select 1 from public.ponto_escalas e
     where e.id = escala_id
       and (auth.uid() = e.user_id or public.is_establishment_member(e.user_id))
       and public.ponto_tem_modulo(e.user_id)))
  with check (exists (
    select 1 from public.ponto_escalas e
     where e.id = escala_id
       and (auth.uid() = e.user_id or public.is_establishment_member(e.user_id))
       and public.ponto_tem_modulo(e.user_id)));

alter table public.ponto_totais enable row level security;
drop policy if exists ponto_totais_gestor on public.ponto_totais;
create policy ponto_totais_gestor on public.ponto_totais
  for all to authenticated
  using (exists (
    select 1 from public.ponto_fechamentos f
     where f.id = fechamento_id
       and (auth.uid() = f.user_id or public.is_establishment_member(f.user_id))
       and public.ponto_tem_modulo(f.user_id)))
  with check (exists (
    select 1 from public.ponto_fechamentos f
     where f.id = fechamento_id
       and (auth.uid() = f.user_id or public.is_establishment_member(f.user_id))
       and public.ponto_tem_modulo(f.user_id)));

alter table public.ponto_export_eventos enable row level security;
drop policy if exists ponto_export_eventos_gestor on public.ponto_export_eventos;
create policy ponto_export_eventos_gestor on public.ponto_export_eventos
  for all to authenticated
  using (exists (
    select 1 from public.ponto_export_layouts l
     where l.id = layout_id
       and (auth.uid() = l.user_id or public.is_establishment_member(l.user_id))
       and public.ponto_tem_modulo(l.user_id)))
  with check (exists (
    select 1 from public.ponto_export_layouts l
     where l.id = layout_id
       and (auth.uid() = l.user_id or public.is_establishment_member(l.user_id))
       and public.ponto_tem_modulo(l.user_id)));

-- ---------------------------------------------------------------------------
-- 9. Quiosque: abrir sessão por PIN no tablet do restaurante
-- ---------------------------------------------------------------------------
--
-- O tablet tem sessão própria, do estabelecimento. Quem se identifica é a
-- pessoa, com PIN de 4 dígitos, e a sessão dura só a batida.

create or replace function public.ponto_definir_pin(_colaborador_id uuid, _pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if _pin !~ '^[0-9]{4,6}$' then raise exception 'pin_invalido'; end if;
  v_owner := public.pdv_resolve_owner(auth.uid());

  update public.ponto_colaboradores
     set pin_hash = crypt(_pin, gen_salt('bf'))
   where id = _colaborador_id and user_id = v_owner;

  if not found then raise exception 'colaborador_nao_encontrado'; end if;
  return true;
end;
$$;

grant execute on function public.ponto_definir_pin(uuid, text) to authenticated;

/**
 * Bater no quiosque. Uma chamada só: identifica pelo PIN e registra.
 * O tablet não guarda sessão de ninguém, então não há como o próximo da fila
 * bater no lugar de quem acabou de sair.
 */
create or replace function public.ponto_bater_quiosque(
  _quiosque_token uuid,
  _pin text,
  _latitude double precision default null,
  _longitude double precision default null,
  _accuracy_m double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_quiosque record;
  v_colab record;
  v_sessao uuid;
  v_resultado jsonb;
begin
  select * into v_quiosque from public.ponto_quiosques where token = _quiosque_token and ativo;
  if not found then
    return jsonb_build_object('error', 'quiosque_invalido');
  end if;
  if not public.ponto_tem_modulo(v_quiosque.user_id) then
    return jsonb_build_object('error', 'modulo_inativo');
  end if;

  -- PIN é curto de propósito (o operador digita em pé, com pressa), então a
  -- busca é dentro do estabelecimento e só entre quem está ativo.
  select c.* into v_colab
    from public.ponto_colaboradores c
   where c.user_id = v_quiosque.user_id
     and c.ativo and c.demissao is null
     and c.pin_hash is not null
     and crypt(coalesce(_pin, ''), c.pin_hash) = c.pin_hash
   limit 1;

  if not found then
    return jsonb_build_object('error', 'pin_invalido');
  end if;

  insert into public.ponto_sessoes (acesso_id, colaborador_id, user_id, dispositivo_fingerprint)
  select a.id, v_colab.id, v_colab.user_id, 'quiosque:' || v_quiosque.id
    from public.ponto_acessos a where a.colaborador_id = v_colab.id
  returning session_token into v_sessao;

  -- Colaborador que ainda não tem link próprio mesmo assim bate no tablet.
  if v_sessao is null then
    insert into public.ponto_acessos (user_id, colaborador_id, password_hash)
    values (v_colab.user_id, v_colab.id, crypt(gen_random_uuid()::text, gen_salt('bf')))
    on conflict (colaborador_id) do update set failed_attempts = 0;

    insert into public.ponto_sessoes (acesso_id, colaborador_id, user_id, dispositivo_fingerprint)
    select a.id, v_colab.id, v_colab.user_id, 'quiosque:' || v_quiosque.id
      from public.ponto_acessos a where a.colaborador_id = v_colab.id
    returning session_token into v_sessao;
  end if;

  update public.ponto_quiosques set ultimo_uso_em = now() where id = v_quiosque.id;

  v_resultado := public.ponto_bater(v_sessao, _latitude, _longitude, _accuracy_m, null, 'tablet', false, null);
  return v_resultado || jsonb_build_object('colaborador_nome', v_colab.nome);
end;
$$;

grant execute on function public.ponto_bater_quiosque(uuid, text, double precision, double precision, double precision) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Perfil de jornada padrão para quem ligar o módulo
-- ---------------------------------------------------------------------------
--
-- Nasce com o piso da CLT. A convenção coletiva do cliente entra depois, como
-- um perfil novo com vigência própria, sem mexer no que já foi apurado.

create or replace function public.ponto_garantir_perfil(_owner uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from public.ponto_perfis_jornada
   where user_id = _owner and vigencia_fim is null
   order by vigencia_inicio desc limit 1;

  if v_id is null then
    insert into public.ponto_perfis_jornada (user_id, nome)
    values (_owner, 'Piso da CLT')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.ponto_garantir_perfil(uuid) to authenticated;

-- Feriados nacionais fixos: o municipal fica por conta do estabelecimento,
-- porque Carnaval e Corpus Christi não são nacionais (Lei 9.093/1995).
insert into public.ponto_feriados (user_id, data, nome, escopo)
select null, d::date, n, 'nacional'
  from (values
    ('2026-01-01', 'Confraternização Universal'),
    ('2026-04-21', 'Tiradentes'),
    ('2026-05-01', 'Dia do Trabalho'),
    ('2026-09-07', 'Independência'),
    ('2026-10-12', 'Nossa Senhora Aparecida'),
    ('2026-11-02', 'Finados'),
    ('2026-11-15', 'Proclamação da República'),
    ('2026-11-20', 'Consciência Negra'),
    ('2026-12-25', 'Natal'),
    ('2027-01-01', 'Confraternização Universal'),
    ('2027-04-21', 'Tiradentes'),
    ('2027-05-01', 'Dia do Trabalho'),
    ('2027-09-07', 'Independência'),
    ('2027-10-12', 'Nossa Senhora Aparecida'),
    ('2027-11-02', 'Finados'),
    ('2027-11-15', 'Proclamação da República'),
    ('2027-11-20', 'Consciência Negra'),
    ('2027-12-25', 'Natal')
  ) as f(d, n)
 where not exists (
   select 1 from public.ponto_feriados x where x.data = d::date and x.escopo = 'nacional' and x.user_id is null
 );

-- Feriado nacional é legível por qualquer usuário autenticado; o municipal
-- segue a policy de dono já criada acima.
drop policy if exists ponto_feriados_nacionais on public.ponto_feriados;
create policy ponto_feriados_nacionais on public.ponto_feriados
  for select to authenticated
  using (user_id is null);
