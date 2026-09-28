-- Módulo de Ponto · a selfie da batida.
--
-- Três cuidados que vêm da pesquisa e do próprio histórico deste projeto:
--
--  * Bucket PRIVADO e novo. Todos os buckets de imagem do Velara são públicos,
--    e checklist-evidence aceita leitura sem condição: rosto de funcionário com
--    hora e lugar não pode morar lá.
--  * A imagem é gravada ANTES da marcação e o caminho entra na linha. Como a
--    marcação é append-only, não existe "salvar a foto depois".
--  * A foto é opcional no banco. Se a câmera falhar, a batida acontece do mesmo
--    jeito: o art. 74 da portaria veda restrição à marcação, e ficar sem
--    registro é pior que ficar sem foto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ponto-selfies', 'ponto-selfies', false, 2097152, array['image/jpeg','image/webp'])
on conflict (id) do update
   set public = false,
       file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg','image/webp'];

-- Ninguém fala com este bucket pelo PostgREST: nem anon, nem o gestor logado.
-- A escrita é da edge function (service role) e a leitura sai por URL assinada
-- de validade curta, gerada pelo painel.
drop policy if exists ponto_selfies_sem_acesso_publico on storage.objects;

-- ponto_bater ganha o caminho e o hash da selfie. A assinatura antiga é
-- removida para não ficarem duas versões e o PostgREST não ter que adivinhar.
drop function if exists public.ponto_bater(uuid, double precision, double precision, double precision, timestamptz, text, boolean, timestamptz);

create or replace function public.ponto_bater(
  _session_token uuid,
  _latitude double precision default null,
  _longitude double precision default null,
  _accuracy_m double precision default null,
  _hora_dispositivo timestamptz default null,
  _coletor text default 'celular',
  _origem_offline boolean default false,
  _marcado_em_offline timestamptz default null,
  _selfie_path text default null,
  _selfie_sha256 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sessao record;
  v_colab record;
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

  select max(marcado_em) into v_ultima
    from public.ponto_marcacoes where colaborador_id = v_colab.id;
  if v_ultima is not null and now() - v_ultima < interval '1 minute' and not _origem_offline then
    return jsonb_build_object('error', 'batida_repetida', 'ultima', v_ultima);
  end if;

  v_marcado := case
    when _origem_offline and _marcado_em_offline is not null
      then least(_marcado_em_offline, now())
    else now()
  end;

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

  insert into public.ponto_sequencias (user_id, proximo_nsr)
  values (v_colab.user_id, 1)
  on conflict (user_id) do update set proximo_nsr = public.ponto_sequencias.proximo_nsr + 1
  returning proximo_nsr into v_nsr;

  v_hash := encode(digest(
    coalesce(v_colab.cpf, v_colab.id::text) || '|' || v_marcado::text || '|' ||
    v_nsr::text || '|' || v_colab.user_id::text || '|' || coalesce(_selfie_sha256, ''), 'sha256'), 'hex');

  insert into public.ponto_marcacoes (
    user_id, colaborador_id, nsr, marcado_em, fuso, coletor, origem_offline,
    hora_dispositivo, desvio_ms, latitude, longitude, accuracy_m,
    local_id, distancia_m, dentro_raio, dispositivo_fingerprint,
    selfie_path, selfie_sha256, registro_sha256, criado_por_sessao
  ) values (
    v_colab.user_id, v_colab.id, v_nsr, v_marcado, 'America/Sao_Paulo',
    coalesce(_coletor, 'celular'), coalesce(_origem_offline, false),
    _hora_dispositivo,
    case when _hora_dispositivo is not null
         then extract(epoch from (_hora_dispositivo - now())) * 1000 end,
    _latitude, _longitude, _accuracy_m,
    v_local.id, v_dist, v_dentro, v_sessao.dispositivo_fingerprint,
    _selfie_path, _selfie_sha256, v_hash, _session_token
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'nsr', v_nsr,
    'marcado_em', v_marcado,
    'dentro_raio', v_dentro,
    'distancia_m', round(v_dist::numeric, 1),
    'hash', v_hash,
    'colaborador', v_colab.nome,
    'com_selfie', _selfie_path is not null
  );
end;
$$;

grant execute on function public.ponto_bater(uuid, double precision, double precision, double precision, timestamptz, text, boolean, timestamptz, text, text) to anon, authenticated;

-- O quiosque chama ponto_bater; como a assinatura mudou, recriamos a chamada.
create or replace function public.ponto_bater_quiosque(
  _quiosque_token uuid,
  _pin text,
  _latitude double precision default null,
  _longitude double precision default null,
  _accuracy_m double precision default null,
  _selfie_path text default null,
  _selfie_sha256 text default null
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
begin
  select * into v_quiosque from public.ponto_quiosques where token = _quiosque_token and ativo;
  if not found then return jsonb_build_object('error', 'quiosque_invalido'); end if;
  if not public.ponto_tem_modulo(v_quiosque.user_id) then
    return jsonb_build_object('error', 'modulo_inativo');
  end if;

  select c.* into v_colab
    from public.ponto_colaboradores c
   where c.user_id = v_quiosque.user_id
     and c.ativo and c.demissao is null
     and c.pin_hash is not null
     and crypt(coalesce(_pin, ''), c.pin_hash) = c.pin_hash
   limit 1;
  if not found then return jsonb_build_object('error', 'pin_invalido'); end if;

  insert into public.ponto_acessos (user_id, colaborador_id, password_hash)
  values (v_colab.user_id, v_colab.id, crypt(gen_random_uuid()::text, gen_salt('bf')))
  on conflict (colaborador_id) do update set failed_attempts = public.ponto_acessos.failed_attempts;

  insert into public.ponto_sessoes (acesso_id, colaborador_id, user_id, dispositivo_fingerprint)
  select a.id, v_colab.id, v_colab.user_id, 'quiosque:' || v_quiosque.id
    from public.ponto_acessos a where a.colaborador_id = v_colab.id
  returning session_token into v_sessao;

  update public.ponto_quiosques set ultimo_uso_em = now() where id = v_quiosque.id;

  return public.ponto_bater(v_sessao, _latitude, _longitude, _accuracy_m, null, 'tablet', false, null, _selfie_path, _selfie_sha256)
         || jsonb_build_object('colaborador_nome', v_colab.nome);
end;
$$;

grant execute on function public.ponto_bater_quiosque(uuid, text, double precision, double precision, double precision, text, text) to anon, authenticated;

-- URL assinada da selfie para o painel: o gestor vê a foto sem o bucket
-- precisar ser público.
create or replace function public.ponto_selfie_url(_marcacao_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_path text;
  v_owner uuid;
begin
  select selfie_path, user_id into v_path, v_owner
    from public.ponto_marcacoes where id = _marcacao_id;
  if v_path is null then return null; end if;
  if not (auth.uid() = v_owner or public.is_establishment_member(v_owner)) then
    raise exception 'sem_permissao';
  end if;
  return v_path;
end;
$$;

grant execute on function public.ponto_selfie_url(uuid) to authenticated;
