-- Tarefas agendadas (pg_cron) que existem só no banco de produção.
-- Retrato tirado em 24/10/2026 do Supabase self-hosted (kvmnexcharge).
--
-- NÃO é migration: as chaves foram trocadas por marcadores. Para recriar num
-- banco novo, troque os marcadores e rode como postgres:
--   <SERVICE_ROLE_KEY>           · chave service_role do projeto (JWT)
--   <DELIVERYMUCH_SWEEP_SECRET>  · mesmo valor da variável das funções
--   <IFOOD_SWEEP_SECRET>         · mesmo valor da variável das funções
--
-- As outras 5 tarefas já estão nas migrations:
--   velara-cashier-cleanup-60d    · 20260630000001_cashier_sessions_auto_cleanup.sql
--   velara-delivery-print-sweep   · 20260804120000_print_bridge_v2.sql
--   velara-mde-sweep-hourly       · 20260703_mde_auto_sweep_cron.sql
--   velara-cashback-gerar         · 20261020200000_cashback_salao.sql
--   velara-liberar-mesas-vazias   · 20261023120000_liberar_mesas_vazias.sql
--
-- api-gw:8000 é o gateway visto de dentro da rede do Docker.

-- Pontos de fidelidade vencidos, todo dia 06:00 UTC.
select cron.schedule('loyalty-expire-points-daily', '0 6 * * *', $job$
  select net.http_post(
    url := 'http://api-gw:8000/functions/v1/loyalty-run-expiration',
    headers := '{"Content-Type":"application/json","apikey":"<SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
$job$);

-- Relatório diário do checklist, 11:00 UTC (08:00 em Brasília).
select cron.schedule('velara-daily-checklist-report', '0 11 * * *', $job$
  select net.http_post(
    url := 'http://api-gw:8000/functions/v1/send-checklist-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
$job$);

-- Pedidos da Delivery Much, a cada 30 s.
select cron.schedule('velara-deliverymuch-sync', '30 seconds', $job$
  select net.http_post(
    url := 'http://api-gw:8000/functions/v1/deliverymuch-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'x-sweep-secret', '<DELIVERYMUCH_SWEEP_SECRET>'),
    body := '{}'::jsonb);
$job$);

-- Pedidos do iFood, a cada 30 s.
select cron.schedule('velara-ifood-sync', '30 seconds', $job$
  select net.http_post(
    url := 'http://api-gw:8000/functions/v1/ifood-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'x-sweep-secret', '<IFOOD_SWEEP_SECRET>'),
    body := '{"action":"sweep"}'::jsonb);
$job$);

-- Cobranças na maquininha (TEF) que passaram do prazo, a cada 30 s.
-- A função está em 20260920270000_tef.sql.
select cron.schedule('velara-tef-expirar', '30 seconds', $job$
  select public.pdv_tef_expirar_pendentes();
$job$);

-- NFC-e automática do delivery/iFood, a cada minuto. Só emite nas lojas com
-- nfce_auto_emit ligado (20261022120000_delivery_nfce_automatica.sql).
select cron.schedule('velara-delivery-nfce', '* * * * *', $job$
  select net.http_post(
    url := 'http://api-gw:8000/functions/v1/delivery-nfce',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
    body := '{"action":"sweep"}'::jsonb);
$job$);
