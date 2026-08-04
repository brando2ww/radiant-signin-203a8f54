-- Print Bridge 2.0 · a tabela vira a fonte de verdade da impressão
--
-- Até aqui, um cupom só era impresso se o INSERT em pdv_print_jobs chegasse à
-- ponte local como evento de Realtime. Evento é efêmero: se o WebSocket morre
-- calado, se o event loop da ponte está congelado num spawnSync de 30s, ou se o
-- serviço está parado por mais de 2h (a janela do reprocesso de boot), o job
-- fica `pending` com attempts=0 e error_message NULL — para sempre. Assinatura
-- confirmada em produção: La Vecchia 02/08 09:42, KOTEN 31/07 19:54, 28/07
-- 19:39 e 22/07 19:28. Nenhum desses pedidos vai imprimir algum dia.
--
-- Esta migration cria o que falta para a ponte parar de depender do evento:
--   1. relógio do servidor no printed_at        (vale para as versões já instaladas)
--   2. lease de execução (claimed_at/claimed_by)
--   3. print_bridge_claim_batch  · reivindicação atômica por polling
--   4. print_bridge_centers      · centros sem depender do histórico
--   5. heartbeat + enrollment    · saber daqui se a ponte está viva
--   6. manifesto de release      · canário e rollback do auto-update
--   7. sweep passa a cobrir comanda_caixa (a via do caixa que nunca nascia)
--
-- Tudo é aditivo. O único efeito imediato sobre quem roda a 1.4.x é o item 1,
-- que é exatamente o desejado.

-- ---------------------------------------------------------------------------
-- 1 · Relógio do servidor
-- ---------------------------------------------------------------------------
-- printed_at era gravado com `new Date()` do PC do cliente. O PC do La Vecchia
-- está ~30s adiantado, então toda impressão de lá aparece com 30s de latência
-- (variância quase zero: média 29,9s / máx 30,2s) enquanto o KOTEN mostra 2-3s
-- reais. Isso inutiliza qualquer medição de "a impressão está demorando?".

CREATE OR REPLACE FUNCTION public.pdv_print_jobs_server_clock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if NEW.status = 'printed' and OLD.status is distinct from 'printed' then
    NEW.printed_at := now();
  end if;

  -- Job que volta para a fila perde o lease: senão o reconciliador acha que
  -- ainda está na mão de alguém.
  if NEW.status = 'pending' and OLD.status is distinct from 'pending' then
    NEW.claimed_at := null;
    NEW.claimed_by := null;
  end if;

  return NEW;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2 · Lease de execução
-- ---------------------------------------------------------------------------
-- resetOrphanedPrintingJobs filtrava por `created_at < now()-5min`, isto é, um
-- job criado há 6 minutos e reivindicado há 2 segundos já era elegível a reset.
-- Com claimed_at o lease é medido do momento certo, e claimed_by diz QUAL
-- instalação está com ele (uma ponte trata o próprio órfão em 2 min; o de outra
-- instalação, só em 10).

ALTER TABLE public.pdv_print_jobs
  ADD COLUMN IF NOT EXISTS claimed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by         text,
  ADD COLUMN IF NOT EXISTS printed_by         text,
  ADD COLUMN IF NOT EXISTS last_attempt_error text;

COMMENT ON COLUMN public.pdv_print_jobs.claimed_at IS
  'Quando a ponte reivindicou o job. Base do lease: printing com claimed_at velho = órfão.';
COMMENT ON COLUMN public.pdv_print_jobs.claimed_by IS
  'install_id da ponte que reivindicou. Distingue órfão próprio de órfão alheio.';

DROP TRIGGER IF EXISTS trg_pdv_print_jobs_server_clock ON public.pdv_print_jobs;
CREATE TRIGGER trg_pdv_print_jobs_server_clock
  BEFORE UPDATE ON public.pdv_print_jobs
  FOR EACH ROW EXECUTE FUNCTION public.pdv_print_jobs_server_clock();

-- O reconciliador varre por (tenant, status, created_at) a cada 20s.
CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_status_created
  ON public.pdv_print_jobs (tenant_user_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3 · Registro de instalações (enrollment TOFU)
-- ---------------------------------------------------------------------------
-- A anon key é pública, então "quem pode escrever heartbeat" não pode ser
-- "qualquer um". Primeira instalação a se apresentar com um install_id vira a
-- dona dele (trust on first use); depois, só continua se apresentar o mesmo
-- segredo. Revogar é um UPDATE.

CREATE TABLE IF NOT EXISTS public.pdv_print_bridge_devices (
  install_id      uuid PRIMARY KEY,
  tenant_user_id  uuid NOT NULL,
  secret_hash     text NOT NULL,
  hostname        text,
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  revoked_reason  text
);
ALTER TABLE public.pdv_print_bridge_devices ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito: ninguém acessa direto, só pelas funções SECURITY DEFINER.

-- Guarda usada por todas as RPCs da ponte. Instalação desconhecida passa (é o
-- comportamento de hoje, em que a RLS de pdv_print_jobs é USING(true) para
-- anon); instalação revogada ou com segredo trocado é barrada. Assim ganhamos
-- um botão de desligar sem criar um jeito novo da impressão parar.
CREATE OR REPLACE FUNCTION public.print_bridge_assert_device(
  p_install_id uuid,
  p_tenant     uuid,
  p_secret     text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_dev record;
begin
  if p_install_id is null then
    return;
  end if;

  select * into v_dev
  from public.pdv_print_bridge_devices
  where install_id = p_install_id;

  if not found then
    return;
  end if;

  if v_dev.revoked_at is not null then
    raise exception 'instalacao revogada em % (%)', v_dev.revoked_at, coalesce(v_dev.revoked_reason, 'sem motivo');
  end if;

  if v_dev.tenant_user_id <> p_tenant then
    raise exception 'install_id pertence a outro estabelecimento';
  end if;

  if p_secret is not null
     and v_dev.secret_hash <> encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') then
    raise exception 'segredo da instalacao nao confere';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4 · Reivindicação atômica em lote (o coração da v2)
-- ---------------------------------------------------------------------------
-- Uma chamada a cada 20s substitui a dependência do evento. Reivindica:
--   · pending dentro da janela (default 3h)
--   · printing cujo lease venceu  → recupera órfão sem esperar restart
--   · printing legado sem claimed_at (versões 1.x) depois de 10 min
-- FOR UPDATE SKIP LOCKED + o predicado de status fazem o polling e o Realtime
-- disputarem a MESMA transição: quem perde recebe zero linhas e não faz nada.
--
-- p_max_age_minutes existe para não despejar cupons de dias atrás na cozinha
-- quando a v2 subir. O que passar da janela fica visível no painel e só sai por
-- clique explícito.

CREATE OR REPLACE FUNCTION public.print_bridge_claim_batch(
  p_tenant           uuid,
  p_device           text    DEFAULT null,
  p_limit            int     DEFAULT 10,
  p_max_age_minutes  int     DEFAULT 180,
  p_lease_seconds    int     DEFAULT 120,
  p_max_attempts     int     DEFAULT 6
) RETURNS SETOF public.pdv_print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Job que esgotou as tentativas não pode ficar preso em printing para sempre.
  update public.pdv_print_jobs
     set status = 'failed',
         error_message = coalesce(last_attempt_error, error_message, 'tentativas esgotadas')
   where tenant_user_id = p_tenant
     and status = 'printing'
     and attempts >= p_max_attempts
     and claimed_at is not null
     and claimed_at < now() - make_interval(secs => p_lease_seconds);

  return query
  update public.pdv_print_jobs j
     set status     = 'printing',
         attempts   = j.attempts + 1,
         claimed_at = now(),
         claimed_by = p_device
   where j.id in (
     select c.id
       from public.pdv_print_jobs c
      where c.tenant_user_id = p_tenant
        and c.created_at > now() - make_interval(mins => p_max_age_minutes)
        and c.attempts < p_max_attempts
        and (
          c.status = 'pending'
          or (c.status = 'printing'
              and c.claimed_at is not null
              and c.claimed_at < now() - make_interval(secs => p_lease_seconds))
          or (c.status = 'printing'
              and c.claimed_at is null
              and c.created_at < now() - interval '10 minutes')
        )
      order by c.created_at
      limit greatest(1, least(p_limit, 50))
      for update skip locked
   )
  returning j.*;
end;
$function$;

COMMENT ON FUNCTION public.print_bridge_claim_batch(uuid, text, int, int, int, int) IS
  'Reivindicação atômica de jobs pela Print Bridge. Caminho redundante ao Realtime: garante que nenhum pedido se perca mesmo com o WebSocket morto.';

-- Versão de um job só, usada pelo caminho do Realtime (mesma transição, mesma
-- garantia; o handler deixa de fazer o update inline).
CREATE OR REPLACE FUNCTION public.print_bridge_claim_one(
  p_job_id  uuid,
  p_device  text DEFAULT null,
  p_max_attempts int DEFAULT 6
) RETURNS SETOF public.pdv_print_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  update public.pdv_print_jobs j
     set status     = 'printing',
         attempts   = j.attempts + 1,
         claimed_at = now(),
         claimed_by = p_device
   where j.id = p_job_id
     and j.status = 'pending'
     and j.attempts < p_max_attempts
  returning j.*;
$function$;

-- Renovação de lease enquanto a ponte tenta imprimir (retries internos).
CREATE OR REPLACE FUNCTION public.print_bridge_renew_lease(
  p_job_id uuid,
  p_device text DEFAULT null
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  update public.pdv_print_jobs
     set claimed_at = now()
   where id = p_job_id
     and status = 'printing'
     and (claimed_by is not distinct from p_device or claimed_by is null);
$function$;

-- ---------------------------------------------------------------------------
-- 5 · Centros configurados sem depender do histórico
-- ---------------------------------------------------------------------------
-- A ponte só tem a anon key, e pdv_production_centers exige sessão autenticada
-- (RLS is_establishment_member). Por isso ela derivava a lista de impressoras
-- dos jobs dos últimos 30 dias — e impressora recém-cadastrada, que ainda não
-- imprimiu, simplesmente não existia para o painel nem para o alerta.

CREATE OR REPLACE FUNCTION public.print_bridge_centers(p_tenant uuid)
RETURNS TABLE (
  id             uuid,
  name           text,
  printer_ip     text,
  printer_port   int,
  print_complete boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
  select pc.id,
         pc.name,
         pc.printer_ip,
         coalesce(pc.printer_port, 9100),
         pc.print_complete
    from public.pdv_production_centers pc
   where pc.user_id = p_tenant
     and pc.is_active
     and pc.printer_ip is not null
   order by pc.display_order nulls last, pc.name;
$function$;

-- ---------------------------------------------------------------------------
-- 6 · Heartbeat: saber daqui se a ponte está viva
-- ---------------------------------------------------------------------------
-- Hoje descobrir se a ponte está de pé exige abrir localhost:7777 no PC do
-- cliente por AnyDesk. Uma linha por instalação resolve isso para sempre.
-- Não reusamos pdv_printer_status porque ela é chaveada por
-- (device_id, production_center_id) e significa "este NAVEGADOR testou esta
-- impressora", com RLS só para authenticated.

CREATE TABLE IF NOT EXISTS public.pdv_print_bridge_status (
  install_id             uuid PRIMARY KEY,
  tenant_user_id         uuid NOT NULL,
  establishment_name     text,
  version                text,
  hostname               text,
  pid                    int,
  started_at             timestamptz,
  last_seen_at           timestamptz NOT NULL DEFAULT now(),
  realtime_status        text,
  realtime_last_event_at timestamptz,
  poll_last_ok_at        timestamptz,
  jobs_processed         int NOT NULL DEFAULT 0,
  jobs_failed            int NOT NULL DEFAULT 0,
  pending_count          int,
  stuck_count            int,
  clock_skew_ms          int,
  printers               jsonb NOT NULL DEFAULT '[]'::jsonb,
  update_state           text,
  last_update_error      text,
  panel_token            text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_bridge_status_tenant
  ON public.pdv_print_bridge_status (tenant_user_id);

ALTER TABLE public.pdv_print_bridge_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem status da ponte" ON public.pdv_print_bridge_status;
CREATE POLICY "Membros leem status da ponte"
  ON public.pdv_print_bridge_status
  FOR SELECT TO authenticated
  USING (
    tenant_user_id = auth.uid()
    OR public.is_establishment_member(tenant_user_id)
    OR public.is_super_admin()
  );

GRANT SELECT ON public.pdv_print_bridge_status TO authenticated;
-- anon NÃO recebe grant: escreve só pela RPC abaixo.

-- Uma chamada a cada 30s faz heartbeat + descoberta de centros + medição de
-- desvio de relógio + manifesto de atualização. Payload < 2 KB.
CREATE OR REPLACE FUNCTION public.print_bridge_sync(
  p_install_id uuid,
  p_tenant     uuid,
  p_secret     text,
  p_state      jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_out jsonb;
begin
  perform public.print_bridge_assert_device(p_install_id, p_tenant, p_secret);

  insert into public.pdv_print_bridge_devices (install_id, tenant_user_id, secret_hash, hostname)
  values (p_install_id, p_tenant,
          encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex'),
          p_state->>'hostname')
  on conflict (install_id) do nothing;

  insert into public.pdv_print_bridge_status as s (
    install_id, tenant_user_id, establishment_name, version, hostname, pid,
    started_at, last_seen_at, realtime_status, realtime_last_event_at,
    poll_last_ok_at, jobs_processed, jobs_failed, pending_count, stuck_count,
    clock_skew_ms, printers, update_state, last_update_error, panel_token
  ) values (
    p_install_id, p_tenant,
    p_state->>'establishment_name',
    p_state->>'version',
    p_state->>'hostname',
    nullif(p_state->>'pid', '')::int,
    nullif(p_state->>'started_at', '')::timestamptz,
    now(),
    p_state->>'realtime_status',
    nullif(p_state->>'realtime_last_event_at', '')::timestamptz,
    nullif(p_state->>'poll_last_ok_at', '')::timestamptz,
    coalesce(nullif(p_state->>'jobs_processed', '')::int, 0),
    coalesce(nullif(p_state->>'jobs_failed', '')::int, 0),
    nullif(p_state->>'pending_count', '')::int,
    nullif(p_state->>'stuck_count', '')::int,
    nullif(p_state->>'clock_skew_ms', '')::int,
    coalesce(p_state->'printers', '[]'::jsonb),
    p_state->>'update_state',
    p_state->>'last_update_error',
    p_state->>'panel_token'
  )
  on conflict (install_id) do update set
    tenant_user_id         = excluded.tenant_user_id,
    establishment_name     = coalesce(excluded.establishment_name, s.establishment_name),
    version                = coalesce(excluded.version, s.version),
    hostname               = coalesce(excluded.hostname, s.hostname),
    pid                    = coalesce(excluded.pid, s.pid),
    started_at             = coalesce(excluded.started_at, s.started_at),
    last_seen_at           = now(),
    realtime_status        = excluded.realtime_status,
    realtime_last_event_at = excluded.realtime_last_event_at,
    poll_last_ok_at        = excluded.poll_last_ok_at,
    jobs_processed         = excluded.jobs_processed,
    jobs_failed            = excluded.jobs_failed,
    pending_count          = excluded.pending_count,
    stuck_count            = excluded.stuck_count,
    clock_skew_ms          = excluded.clock_skew_ms,
    printers               = excluded.printers,
    update_state           = excluded.update_state,
    last_update_error      = excluded.last_update_error,
    panel_token            = coalesce(excluded.panel_token, s.panel_token);

  select jsonb_build_object(
    'server_time', now(),
    'centers', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.print_bridge_centers(p_tenant) c
    ), '[]'::jsonb),
    'release', coalesce((
      select a.value from public.admin_settings a where a.key = 'print_bridge_release'
    ), '{}'::jsonb)
  ) into v_out;

  return v_out;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7 · Manifesto de release (canário e rollback sem rebuild)
-- ---------------------------------------------------------------------------
-- auto_update entra DESLIGADO. Só ligamos depois que o heartbeat provar, por
-- dias, que enxergamos as duas instalações em tempo real — auto-update é a
-- única peça capaz de causar justamente o problema que resolve.

INSERT INTO public.admin_settings (key, value)
VALUES ('print_bridge_release', jsonb_build_object(
  'auto_update', false,
  'window', '04:00-06:00',
  'stable', jsonb_build_object(
    'version', null,
    'url', null,
    'sha256', null,
    'signature', null
  ),
  'pinned', '{}'::jsonb
))
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8 · Permissões das RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.print_bridge_claim_batch(uuid, text, int, int, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.print_bridge_claim_one(uuid, text, int)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.print_bridge_renew_lease(uuid, text)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.print_bridge_centers(uuid)                               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.print_bridge_sync(uuid, uuid, text, jsonb)               TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.print_bridge_assert_device(uuid, uuid, text) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9 · Sweep passa a cobrir a via do caixa
-- ---------------------------------------------------------------------------
-- Lacuna registrada em 30/07 e ainda aberta: o sweep server-side só enfileira
-- source_kind='delivery'. A comanda do caixa (print_complete) só nasce do
-- navegador, em dispatchCaixaJobs. Sem aba do PDV aberta, a cozinha imprime
-- pelo sweep e o salão não recebe nada. Medido no La Vecchia: os pedidos de
-- 02/08 09:42, 02/08 12:04, 02/08 13:09 e quatro de 29/07 saíram com uma via só.
--
-- O payload replica exatamente o de src/lib/delivery-print.ts (dispatchCaixaJobs),
-- inclusive a tradução discount→discount_amount e change_for→change_amount, que
-- é o que a ponte lê. Dedup por (pedido, centro), com unique_violation engolido:
-- coexiste com o navegador sem duplicar.

CREATE OR REPLACE FUNCTION public.enqueue_delivery_prints_sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_count int := 0;
  r_order record;
  r_center record;
  v_short text;
  v_items jsonb;
  v_payload jsonb;
  v_all_items jsonb;
  v_complement text;
  v_reference text;
begin
  for r_order in
    select o.*
    from public.delivery_orders o
    where o.created_at > now() - interval '15 minutes'
      and o.status <> 'cancelled'
      and o.order_type in ('delivery','pickup')
      -- só estabelecimentos que realmente imprimem
      and exists (
        select 1
        from public.pdv_production_centers pc2
        where pc2.user_id = o.user_id
          and pc2.printer_ip is not null
          and pc2.is_active
      )
  loop
    v_short := coalesce(
      case when r_order.ticket_number is not null then lpad(r_order.ticket_number::text, 3, '0') end,
      regexp_replace(coalesce(r_order.order_number, ''), '^#+', '')
    );

    -- ---------------- via de produção (cozinha, bar, ...) ----------------
    for r_center in
      select oi.production_center_id as center_id,
             pc.name as center_name,
             pc.printer_ip as printer_ip,
             coalesce(pc.printer_port, 9100) as printer_port
      from public.delivery_order_items oi
      left join public.pdv_production_centers pc on pc.id = oi.production_center_id
      where oi.order_id = r_order.id
      group by oi.production_center_id, pc.name, pc.printer_ip, pc.printer_port
    loop
      -- já existe job para (pedido, centro)? pula (cobre inclusive centro NULL)
      if exists (
        select 1 from public.pdv_print_jobs j
        where j.source_kind = 'delivery'
          and j.source_item_id = r_order.id
          and j.center_id is not distinct from r_center.center_id
      ) then
        continue;
      end if;

      select jsonb_agg(
               jsonb_build_object(
                 'product_name', oi.product_name,
                 'quantity', oi.quantity,
                 'notes', oi.notes,
                 'modifiers', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'name', case when coalesce(op.quantity, 1) > 1
                                         then op.quantity::text || 'x ' || op.item_name
                                         else op.item_name end))
                   from public.delivery_order_item_options op
                   where op.order_item_id = oi.id and op.item_name is not null
                 ), '[]'::jsonb)
               )
               order by oi.id
             )
      into v_items
      from public.delivery_order_items oi
      where oi.order_id = r_order.id
        and oi.production_center_id is not distinct from r_center.center_id;

      v_payload := jsonb_build_object(
        'kind', 'delivery',
        'mesa_numero', 'DELIVERY',
        'comanda_nome', coalesce(r_order.customer_name, 'Cliente'),
        'comanda_number', v_short,
        'ticket_number', r_order.ticket_number,
        'order_number', v_short,
        'customer_name', r_order.customer_name,
        'customer_phone', r_order.customer_phone,
        'order_type', r_order.order_type,
        'delivery_address', r_order.delivery_address_text,
        'items', coalesce(v_items, '[]'::jsonb)
      );

      begin
        insert into public.pdv_print_jobs
          (tenant_user_id, source_kind, source_item_id, center_id, center_name,
           printer_ip, printer_port, payload, status, error_message)
        values
          (r_order.user_id, 'delivery', r_order.id, r_center.center_id, r_center.center_name,
           r_center.printer_ip, r_center.printer_port, v_payload,
           case when r_center.printer_ip is not null then 'pending' else 'failed' end,
           case when r_center.printer_ip is not null then null else 'sem impressora configurada' end);
        v_count := v_count + 1;
      exception when unique_violation then
        null; -- corrida com o dispatch do navegador: ok
      end;
    end loop;

    -- ---------------- via completa do caixa (print_complete) ----------------
    v_all_items := null;
    v_complement := null;
    v_reference := null;

    for r_center in
      select pc.id as center_id,
             pc.name as center_name,
             pc.printer_ip as printer_ip,
             coalesce(pc.printer_port, 9100) as printer_port
      from public.pdv_production_centers pc
      where pc.user_id = r_order.user_id
        and pc.is_active
        and pc.print_complete
    loop
      if exists (
        select 1 from public.pdv_print_jobs j
        where j.source_kind = 'comanda_caixa'
          and j.source_item_id = r_order.id
          and j.center_id is not distinct from r_center.center_id
      ) then
        continue;
      end if;

      -- Itens e endereço completo custam caro: só monta quando há o que imprimir.
      if v_all_items is null then
        select jsonb_agg(
                 jsonb_build_object(
                   'product_name', oi.product_name,
                   'quantity', oi.quantity,
                   'notes', oi.notes,
                   'modifiers', coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'name', case when coalesce(op.quantity, 1) > 1
                                           then op.quantity::text || 'x ' || op.item_name
                                           else op.item_name end))
                     from public.delivery_order_item_options op
                     where op.order_item_id = oi.id and op.item_name is not null
                   ), '[]'::jsonb)
                 )
                 order by oi.id
               )
        into v_all_items
        from public.delivery_order_items oi
        where oi.order_id = r_order.id;

        v_all_items := coalesce(v_all_items, '[]'::jsonb);

        -- Complemento e referência não cabem no delivery_address_text (linha
        -- única) e são justamente o que o entregador precisa.
        if r_order.delivery_address_id is not null then
          select nullif(btrim(coalesce(da.complement, '')), ''),
                 nullif(btrim(coalesce(da.reference, '')), '')
            into v_complement, v_reference
            from public.delivery_addresses da
           where da.id = r_order.delivery_address_id;
        end if;
      end if;

      v_payload := jsonb_build_object(
        'kind', 'comanda_caixa',
        'order_number', r_order.order_number,
        'ticket_number', r_order.ticket_number,
        'customer_name', r_order.customer_name,
        'customer_phone', r_order.customer_phone,
        'order_type', r_order.order_type,
        'delivery_address', r_order.delivery_address_text,
        'delivery_complement', v_complement,
        'delivery_reference', v_reference,
        'subtotal', r_order.subtotal,
        'delivery_fee', r_order.delivery_fee,
        'discount_amount', r_order.discount,
        'total', r_order.total,
        'payment_method', r_order.payment_method,
        'payment_status', r_order.payment_status,
        'change_amount', r_order.change_for,
        'notes', r_order.notes,
        'items', v_all_items
      );

      begin
        insert into public.pdv_print_jobs
          (tenant_user_id, source_kind, source_item_id, center_id, center_name,
           printer_ip, printer_port, payload, status, error_message)
        values
          (r_order.user_id, 'comanda_caixa', r_order.id, r_center.center_id, r_center.center_name,
           r_center.printer_ip, r_center.printer_port, v_payload,
           case when r_center.printer_ip is not null then 'pending' else 'failed' end,
           case when r_center.printer_ip is not null then null else 'sem impressora configurada' end);
        v_count := v_count + 1;
      exception when unique_violation then
        null; -- corrida com dispatchCaixaJobs: ok
      end;
    end loop;
  end loop;

  return v_count;
end;
$function$;

COMMENT ON FUNCTION public.enqueue_delivery_prints_sweep() IS
  'Rede de segurança da impressão de delivery: enfileira a via de produção E a via completa do caixa (print_complete) independentemente do navegador do PDV estar aberto. Roda a cada 30s pelo cron velara-delivery-print-sweep.';

-- O agendamento existia só como comentário desde 03/07 (aplicado à mão pela
-- Management API). Fica versionado aqui para ser reproduzível.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'velara-delivery-print-sweep') THEN
    PERFORM cron.schedule(
      'velara-delivery-print-sweep',
      '30 seconds',
      'select public.enqueue_delivery_prints_sweep();'
    );
  END IF;
END
$do$;
