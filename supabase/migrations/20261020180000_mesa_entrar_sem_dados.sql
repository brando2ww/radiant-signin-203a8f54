-- Mesa Digital · entrar numa comanda que já existe sem pedir nome e celular de novo (20/10/2026).
-- Pedido do dono: ao tocar numa comanda da lista, só um aviso de confirmação ("Entrar na comanda de Ana S.?").
-- A sessão leva o nome e o celular da comanda. Abrir mesa ou comanda nova continua pedindo nome e celular.
-- Igual à definição em produção (20261020170000), mais esse desvio.

CREATE OR REPLACE FUNCTION public.mesa_entrar(p_token text, p_table_id uuid, p_nome text, p_celular text, p_user_agent text DEFAULT NULL::text, p_comanda_id uuid DEFAULT NULL::uuid, p_nova boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if p_comanda_id is not null and length(v_nome) < 2 then
    -- Entrar numa comanda que já existe não pede nome e celular de novo: a sessão leva os da comanda
    -- (o aviso de "chamar garçom" mostra de qual comanda veio).
    select left(coalesce(nullif(btrim(c.customer_name), ''), 'Comanda ' || c.comanda_number), 60),
           regexp_replace(coalesce(c.customer_phone, ''), '\D', '', 'g')
      into v_nome, v_cel
      from pdv_comandas c where c.id = p_comanda_id and c.user_id = v_qr.user_id;
    if v_nome is null then return jsonb_build_object('error', 'comanda_invalida'); end if;
  else
    if length(v_nome) < 2 then return jsonb_build_object('error', 'nome_invalido'); end if;
    if v_cel ~ '^55\d{10,11}$' then v_cel := substr(v_cel, 3); end if;
    if v_cel !~ '^\d{10,11}$' then return jsonb_build_object('error', 'celular_invalido'); end if;
  end if;

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
