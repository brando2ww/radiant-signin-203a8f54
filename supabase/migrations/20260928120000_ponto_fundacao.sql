-- Módulo de Ponto · fundação (fase 1a do plano em docs/modulo-ponto/PLANO.md)
--
-- Três decisões desta migration, que valem para tudo que vier depois:
--
-- 1. A marcação é APPEND-ONLY de verdade. Não é convenção de equipe: é REVOKE
--    no papel que o PostgREST usa MAIS trigger que levanta exceção. O hábito
--    deste projeto é corrigir dado em produção por SQL direto, e isso não pode
--    encostar em registro de jornada. Correção de ponto é registro novo, nunca
--    edição (Portaria MTP 671/2021, art. 74, IV e art. 82).
--
-- 2. A hora que vale é a do SERVIDOR. O celular do funcionário adianta relógio,
--    e a norma pede hora sincronizada com variação máxima de 30 segundos. O
--    app nunca envia a hora da batida; ele recebe.
--
-- 3. O gate de módulo desce para o banco. No frontend, use-user-modules.ts tem
--    `if (!tenantId) return true`, que libera tudo para tenant legado. Isso é
--    tolerável em tela de relatório e inaceitável em dado de jornada, então
--    toda policy daqui exige ponto_tem_modulo() explicitamente.

-- ---------------------------------------------------------------------------
-- 0. Helper de módulo · a fonte da verdade é tenant_modules
-- ---------------------------------------------------------------------------
--
-- has_module_access() existe no banco mas lê a tabela LEGADA user_modules, e o
-- enum user_module nem conhece 'tarefas' e 'compras'. Quem manda hoje é
-- tenant_modules (texto), alimentada pelo Stripe e pelo super admin.

create or replace function public.ponto_tem_modulo(_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.tenants t
      join public.tenant_modules tm on tm.tenant_id = t.id
     where t.owner_user_id = _owner
       and tm.module = 'ponto'
       and tm.is_active = true
       and (tm.expires_at is null or tm.expires_at > now())
  )
$$;

comment on function public.ponto_tem_modulo(uuid) is
  'O tenant do dono comprou o módulo de ponto? Sem tenant, é não · ao contrário do frontend, que libera tudo para legado.';

grant execute on function public.ponto_tem_modulo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Configuração do módulo por estabelecimento
-- ---------------------------------------------------------------------------

create table if not exists public.ponto_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  modo text not null default 'gestao' check (modo in ('gestao', 'rep_p')),
  raio_padrao_m int not null default 150 check (raio_padrao_m between 50 and 1000),
  -- Fora do raio REGISTRA e sinaliza. Bloquear é o que o gerente vai pedir e
  -- o que o art. 74, I da portaria veda; além disso o erro de GPS dentro de
  -- prédio passa de 16 m, e cozinha com coifa de inox é o pior cenário.
  fora_raio_acao text not null default 'sinaliza' check (fora_raio_acao in ('sinaliza')),
  exige_selfie boolean not null default true,
  retencao_selfie_dias int not null default 90,
  retencao_gps_dias int not null default 90,
  tolerancia_extremo_min int not null default 5 check (tolerancia_extremo_min between 0 and 5),
  tolerancia_dia_min int not null default 10 check (tolerancia_dia_min between 0 and 10),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.ponto_config is
  'Política do ponto por estabelecimento. A tolerância tem teto no CHECK porque a Súmula 449 do TST não admite mais que 5 min por extremo e 10 no dia.';

-- ---------------------------------------------------------------------------
-- 2. Colaborador · a identidade única que hoje não existe
-- ---------------------------------------------------------------------------
--
-- Funcionário no Velara são três cadastros e nenhum é RH: establishment_users
-- (login real), checklist_operators (PIN) e pdv_authorized_employees (consumo
-- interno). O espelho de ponto exige nome, CPF, admissão e cargo, e sem uma
-- identidade única a gorjeta rateada por hora trabalhada não sai.

create table if not exists public.ponto_colaboradores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cpf text,
  pis text,
  cargo text,
  admissao date,
  -- Desligamento é DATA, nunca delete: apagar colaborador apaga a prova de
  -- jornada. delete-establishment-user chama auth.admin.deleteUser, que
  -- cascateia, e por isso auth_user_id abaixo NÃO tem on delete cascade.
  demissao date,
  tipo_contrato text not null default 'clt'
    check (tipo_contrato in ('clt', 'aprendiz', 'parcial', '12x36', 'intermitente')),
  carga_semanal_min int,
  matricula_contador text,
  matricula_esocial text,
  auth_user_id uuid references auth.users(id) on delete set null,
  establishment_user_id uuid,
  checklist_operator_id uuid,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, cpf)
);

create index if not exists idx_ponto_colab_owner on public.ponto_colaboradores (user_id, ativo);
create index if not exists idx_ponto_colab_auth on public.ponto_colaboradores (auth_user_id) where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Acesso do colaborador · link com senha, no molde já testado em produção
-- ---------------------------------------------------------------------------
--
-- Molde: pdv_stock_count_links. Garçom e cozinheiro não têm e-mail
-- corporativo, e a rotatividade do setor faria o gerente criar e apagar
-- usuário toda semana. Quem já tem login em establishment_users entra pelo
-- login e cai na mesma tela.
--
-- O que NÃO copiar: checklist_operators, onde o PIN está em texto puro e é
-- conferido por select anônimo.

create table if not exists public.ponto_acessos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  colaborador_id uuid not null references public.ponto_colaboradores(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  password_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  revogado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (colaborador_id)
);

create table if not exists public.ponto_sessoes (
  session_token uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.ponto_acessos(id) on delete cascade,
  colaborador_id uuid not null references public.ponto_colaboradores(id) on delete cascade,
  user_id uuid not null,
  dispositivo_fingerprint text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '12 hours'
);

create index if not exists idx_ponto_sessoes_colab on public.ponto_sessoes (colaborador_id, expira_em);

-- ---------------------------------------------------------------------------
-- 4. Onde se bate o ponto · a cerca virtual
-- ---------------------------------------------------------------------------

create table if not exists public.ponto_locais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  latitude double precision,
  longitude double precision,
  raio_m int not null default 150 check (raio_m between 50 and 1000),
  tipo text not null default 'fixo' check (tipo in ('fixo', 'externo')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists idx_ponto_locais_owner on public.ponto_locais (user_id, ativo);

-- ---------------------------------------------------------------------------
-- 5. Aparelho vinculado · antifraude de custo zero
-- ---------------------------------------------------------------------------
--
-- Vincula o aparelho ao colaborador e registra quando muda. É SINAL, não
-- trava: celular perdido às 23h de sábado não pode impedir a batida, porque
-- colaborador sem registro no dia é justamente o que a fiscalização pune.

create table if not exists public.ponto_dispositivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  colaborador_id uuid not null references public.ponto_colaboradores(id) on delete cascade,
  fingerprint text not null,
  apelido text,
  primeiro_uso_em timestamptz not null default now(),
  ultimo_uso_em timestamptz not null default now(),
  reconhecido boolean not null default false,
  reconhecido_por uuid,
  reconhecido_em timestamptz,
  unique (colaborador_id, fingerprint)
);

-- ---------------------------------------------------------------------------
-- 6. A marcação · append-only
-- ---------------------------------------------------------------------------

create table if not exists public.ponto_marcacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  colaborador_id uuid not null references public.ponto_colaboradores(id),
  -- Sequencial por estabelecimento, começando em 1. No modo gestão serve de
  -- número de comprovante; no modo REP-P é o NSR exigido pelo Anexo IX.
  nsr bigint not null,
  marcado_em timestamptz not null,
  gravado_em timestamptz not null default now(),
  fuso text not null default 'America/Sao_Paulo',
  coletor text not null default 'celular' check (coletor in ('celular', 'tablet', 'painel')),
  origem_offline boolean not null default false,
  -- Hora que o aparelho achava que era, junto do desvio medido contra o
  -- servidor. Serve para auditar batida offline; nunca substitui marcado_em.
  hora_dispositivo timestamptz,
  desvio_ms int,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  local_id uuid references public.ponto_locais(id),
  distancia_m double precision,
  dentro_raio boolean,
  selfie_path text,
  selfie_sha256 text,
  dispositivo_fingerprint text,
  registro_sha256 text not null,
  criado_por_sessao uuid,
  unique (user_id, nsr)
);

create index if not exists idx_ponto_marc_colab_dia
  on public.ponto_marcacoes (colaborador_id, marcado_em desc);
create index if not exists idx_ponto_marc_owner_dia
  on public.ponto_marcacoes (user_id, marcado_em desc);

comment on table public.ponto_marcacoes is
  'Registro de jornada. APPEND-ONLY: sem UPDATE e sem DELETE, por REVOKE e por trigger. Correção é linha nova em ponto_tratamentos.';

-- O contador de NSR vive fora da tabela de marcações para poder ser travado
-- sem travar leitura: quinze garçons batendo no mesmo minuto não podem pegar
-- o mesmo número.
create table if not exists public.ponto_sequencias (
  user_id uuid primary key references auth.users(id) on delete cascade,
  proximo_nsr bigint not null default 1
);

-- ---------------------------------------------------------------------------
-- 7. A trava de imutabilidade
-- ---------------------------------------------------------------------------

create or replace function public.ponto_marcacao_imutavel()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ponto_marcacao_imutavel: marcação de ponto não pode ser % (Portaria MTP 671/2021, art. 74, IV). Use ponto_tratamentos.',
    lower(tg_op);
end;
$$;

drop trigger if exists trg_ponto_marcacoes_imutavel on public.ponto_marcacoes;
create trigger trg_ponto_marcacoes_imutavel
  before update or delete on public.ponto_marcacoes
  for each row execute function public.ponto_marcacao_imutavel();

-- Cinto e suspensório: a trigger protege de qualquer caminho, o REVOKE tira a
-- permissão de quem fala pelo PostgREST.
revoke update, delete on public.ponto_marcacoes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
--
-- Gestor enxerga o estabelecimento inteiro; colaborador NÃO acessa estas
-- tabelas pelo PostgREST, só pelas RPCs de sessão mais abaixo. A RLS de hoje
-- separa estabelecimento, não pessoa, e dado de jornada é pessoal.

alter table public.ponto_config          enable row level security;
alter table public.ponto_colaboradores   enable row level security;
alter table public.ponto_acessos         enable row level security;
alter table public.ponto_sessoes         enable row level security;
alter table public.ponto_locais          enable row level security;
alter table public.ponto_dispositivos    enable row level security;
alter table public.ponto_marcacoes       enable row level security;
alter table public.ponto_sequencias      enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ponto_config', 'ponto_colaboradores', 'ponto_locais',
    'ponto_dispositivos', 'ponto_marcacoes'
  ] loop
    execute format($f$
      drop policy if exists %1$s_gestor_le on public.%1$s;
      create policy %1$s_gestor_le on public.%1$s
        for select to authenticated
        using (
          (auth.uid() = user_id or public.is_establishment_member(user_id))
          and public.ponto_tem_modulo(user_id)
        );
    $f$, t);
  end loop;

  -- Escrita: só o dono e quem é membro do estabelecimento, e nunca em
  -- marcações (que não tem policy de insert: só a RPC grava).
  foreach t in array array[
    'ponto_config', 'ponto_colaboradores', 'ponto_locais', 'ponto_dispositivos'
  ] loop
    execute format($f$
      drop policy if exists %1$s_gestor_escreve on public.%1$s;
      create policy %1$s_gestor_escreve on public.%1$s
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

-- ponto_acessos guarda hash de senha: nem o gestor lê pelo PostgREST.
-- ponto_sessoes e ponto_sequencias são internas das RPCs.
-- Sem policy = ninguém acessa, que é o objetivo.

-- ---------------------------------------------------------------------------
-- 9. Hora do servidor
-- ---------------------------------------------------------------------------

create or replace function public.ponto_hora_servidor()
returns timestamptz
language sql
stable
as $$ select now() $$;

grant execute on function public.ponto_hora_servidor() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Abrir sessão pelo link com senha
-- ---------------------------------------------------------------------------
--
-- search_path inclui `extensions` porque pgcrypto mora lá neste stack: sem
-- isso, crypt() e gen_salt() somem e a abertura morre com "function gen_salt
-- does not exist". Já aconteceu na contagem de estoque.

create or replace function public.ponto_abrir(
  _token uuid,
  _password text,
  _fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_acesso record;
  v_colab record;
  v_sessao uuid;
  v_novo_aparelho boolean := false;
begin
  select * into v_acesso from public.ponto_acessos where token = _token;
  if not found then
    -- Mesma resposta para token inexistente e senha errada: distinguir entrega
    -- ao atacante que o token existe.
    return jsonb_build_object('error', 'invalid_credentials');
  end if;

  if v_acesso.revogado_em is not null then
    return jsonb_build_object('error', 'acesso_revogado');
  end if;
  if v_acesso.locked_until is not null and v_acesso.locked_until > now() then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;

  if crypt(coalesce(_password, ''), v_acesso.password_hash) <> v_acesso.password_hash then
    update public.ponto_acessos
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' end
     where id = v_acesso.id;
    return jsonb_build_object('error', 'invalid_credentials');
  end if;

  select * into v_colab from public.ponto_colaboradores where id = v_acesso.colaborador_id;
  if not found or not v_colab.ativo or v_colab.demissao is not null then
    return jsonb_build_object('error', 'colaborador_inativo');
  end if;
  if not public.ponto_tem_modulo(v_colab.user_id) then
    return jsonb_build_object('error', 'modulo_inativo');
  end if;

  update public.ponto_acessos set failed_attempts = 0, locked_until = null where id = v_acesso.id;

  if _fingerprint is not null then
    insert into public.ponto_dispositivos (user_id, colaborador_id, fingerprint)
    values (v_colab.user_id, v_colab.id, _fingerprint)
    on conflict (colaborador_id, fingerprint)
      do update set ultimo_uso_em = now()
    returning reconhecido into v_novo_aparelho;
    v_novo_aparelho := not coalesce(v_novo_aparelho, false);
  end if;

  insert into public.ponto_sessoes (acesso_id, colaborador_id, user_id, dispositivo_fingerprint)
  values (v_acesso.id, v_colab.id, v_colab.user_id, _fingerprint)
  returning session_token into v_sessao;

  return jsonb_build_object(
    'session_token', v_sessao,
    'colaborador', jsonb_build_object('id', v_colab.id, 'nome', v_colab.nome, 'cargo', v_colab.cargo),
    'hora_servidor', now(),
    'aparelho_novo', v_novo_aparelho,
    'config', (
      select jsonb_build_object('exige_selfie', c.exige_selfie, 'raio_padrao_m', c.raio_padrao_m)
        from public.ponto_config c where c.user_id = v_colab.user_id
    )
  );
end;
$$;

grant execute on function public.ponto_abrir(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. Bater o ponto
-- ---------------------------------------------------------------------------
--
-- O app NÃO manda a hora da batida: manda no máximo a hora que o aparelho
-- achava que era, para auditoria. Quem carimba é o banco.

create or replace function public.ponto_bater(
  _session_token uuid,
  _latitude double precision default null,
  _longitude double precision default null,
  _accuracy_m double precision default null,
  _hora_dispositivo timestamptz default null,
  _coletor text default 'celular',
  _origem_offline boolean default false,
  _marcado_em_offline timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sessao record;
  v_colab record;
  v_cfg record;
  v_nsr bigint;
  v_local record;
  v_dist double precision;
  v_dentro boolean;
  v_marcado timestamptz;
  v_hash text;
  v_id uuid;
  v_ultima timestamptz;
begin
  select * into v_sessao from public.ponto_sessoes where session_token = _session_token;
  if not found or v_sessao.expira_em < now() then
    return jsonb_build_object('error', 'sessao_expirada');
  end if;

  select * into v_colab from public.ponto_colaboradores where id = v_sessao.colaborador_id;
  if not found or not v_colab.ativo or v_colab.demissao is not null then
    return jsonb_build_object('error', 'colaborador_inativo');
  end if;
  if not public.ponto_tem_modulo(v_colab.user_id) then
    return jsonb_build_object('error', 'modulo_inativo');
  end if;

  select * into v_cfg from public.ponto_config where user_id = v_colab.user_id;

  -- Batida repetida em menos de 1 minuto é toque duplo, não jornada.
  select max(marcado_em) into v_ultima
    from public.ponto_marcacoes where colaborador_id = v_colab.id;
  if v_ultima is not null and now() - v_ultima < interval '1 minute' and not _origem_offline then
    return jsonb_build_object('error', 'batida_repetida', 'ultima', v_ultima);
  end if;

  -- A hora é a do servidor. A batida offline guarda a hora em que aconteceu,
  -- mas nunca uma hora futura nem anterior à última marcação conhecida.
  v_marcado := case
    when _origem_offline and _marcado_em_offline is not null
      then least(_marcado_em_offline, now())
    else now()
  end;

  -- Cerca virtual: o raio aceito soma o erro que o próprio aparelho declara,
  -- porque GPS dentro de prédio erra mais de 16 m com facilidade.
  if _latitude is not null and _longitude is not null then
    select l.*,
           (6371000 * acos(
              least(1, greatest(-1,
                cos(radians(l.latitude)) * cos(radians(_latitude)) *
                cos(radians(_longitude) - radians(l.longitude)) +
                sin(radians(l.latitude)) * sin(radians(_latitude))
              ))
           )) as distancia
      into v_local
      from public.ponto_locais l
     where l.user_id = v_colab.user_id and l.ativo and l.latitude is not null
     order by distancia asc
     limit 1;

    if found then
      v_dist := v_local.distancia;
      v_dentro := v_dist <= (v_local.raio_m + coalesce(_accuracy_m, 0));
    end if;
  end if;

  -- NSR por estabelecimento, com lock de linha: duas batidas simultâneas não
  -- podem pegar o mesmo número.
  insert into public.ponto_sequencias (user_id, proximo_nsr)
  values (v_colab.user_id, 1)
  on conflict (user_id) do update set proximo_nsr = public.ponto_sequencias.proximo_nsr + 1
  returning proximo_nsr into v_nsr;

  v_hash := encode(digest(
    coalesce(v_colab.cpf, v_colab.id::text) || '|' || v_marcado::text || '|' ||
    v_nsr::text || '|' || v_colab.user_id::text, 'sha256'), 'hex');

  insert into public.ponto_marcacoes (
    user_id, colaborador_id, nsr, marcado_em, fuso, coletor, origem_offline,
    hora_dispositivo, desvio_ms, latitude, longitude, accuracy_m,
    local_id, distancia_m, dentro_raio, dispositivo_fingerprint,
    registro_sha256, criado_por_sessao
  ) values (
    v_colab.user_id, v_colab.id, v_nsr, v_marcado, 'America/Sao_Paulo',
    coalesce(_coletor, 'celular'), coalesce(_origem_offline, false),
    _hora_dispositivo,
    case when _hora_dispositivo is not null
         then extract(epoch from (_hora_dispositivo - now())) * 1000 end,
    _latitude, _longitude, _accuracy_m,
    v_local.id, v_dist, v_dentro, v_sessao.dispositivo_fingerprint,
    v_hash, _session_token
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'nsr', v_nsr,
    'marcado_em', v_marcado,
    'dentro_raio', v_dentro,
    'distancia_m', round(v_dist::numeric, 1),
    'hash', v_hash,
    'colaborador', v_colab.nome
  );
end;
$$;

grant execute on function public.ponto_bater(uuid, double precision, double precision, double precision, timestamptz, text, boolean, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. O que o colaborador vê · as últimas 48 horas
-- ---------------------------------------------------------------------------
--
-- Art. 80 da Portaria 671 exige que o trabalhador consiga extrair os
-- comprovantes das últimas 48 horas. No modo gestão isso é a tela; no modo
-- REP-P vira PDF assinado.

create or replace function public.ponto_minhas_marcacoes(_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao record;
begin
  select * into v_sessao from public.ponto_sessoes where session_token = _session_token;
  if not found or v_sessao.expira_em < now() then
    return jsonb_build_object('error', 'sessao_expirada');
  end if;

  return jsonb_build_object(
    'hora_servidor', now(),
    'marcacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nsr', m.nsr,
               'marcado_em', m.marcado_em,
               'dentro_raio', m.dentro_raio,
               'origem_offline', m.origem_offline,
               'hash', m.registro_sha256
             ) order by m.marcado_em desc)
        from public.ponto_marcacoes m
       where m.colaborador_id = v_sessao.colaborador_id
         and m.marcado_em > now() - interval '48 hours'
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.ponto_minhas_marcacoes(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13. Gestão do acesso do colaborador (chamado pelo painel do gestor)
-- ---------------------------------------------------------------------------

create or replace function public.ponto_definir_acesso(
  _colaborador_id uuid,
  _password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
  v_colab record;
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if coalesce(_password, '') = '' then
    raise exception 'password_required';
  end if;

  v_owner := public.pdv_resolve_owner(auth.uid());

  select * into v_colab
    from public.ponto_colaboradores
   where id = _colaborador_id and user_id = v_owner;
  if not found then
    raise exception 'colaborador_nao_encontrado';
  end if;
  if not public.ponto_tem_modulo(v_owner) then
    raise exception 'modulo_inativo';
  end if;

  insert into public.ponto_acessos (user_id, colaborador_id, password_hash)
  values (v_owner, _colaborador_id, crypt(_password, gen_salt('bf')))
  on conflict (colaborador_id) do update
     set password_hash = crypt(_password, gen_salt('bf')),
         failed_attempts = 0,
         locked_until = null,
         revogado_em = null
  returning token into v_token;

  return jsonb_build_object('token', v_token);
end;
$$;

grant execute on function public.ponto_definir_acesso(uuid, text) to authenticated;
