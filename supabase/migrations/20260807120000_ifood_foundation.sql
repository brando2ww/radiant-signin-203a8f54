-- iFood · fundação da integração (token da aplicação, roteamento de lojas,
-- operação e fila de eventos)
--
-- Reescrita do zero. O que existia (ifood-oauth e ifood-sync-reviews, out/2025)
-- nunca funcionou, e isso foi PROVADO contra a API real em 07/08/2026:
--   · mandando o corpo em snake_case, o iFood responde "Invalid grant type
--     null" · ele lê grantType, não grant_type. Era o que o ifood-oauth fazia.
--   · o ifood-sync-reviews consultava ifood_client_id/ifood_client_secret,
--     colunas que nunca existiram em pdv_settings.
-- Em produção não há um único tenant com iFood habilitado, merchant ou token,
-- então não há dado a preservar.
--
-- MODELO: aplicativo CENTRALIZADO (SaaS), confirmado contra a API · o fluxo
-- distribuído (userCode) responde "Grant type not authorized for client".
-- Consequência estrutural: o token é da APLICAÇÃO, não da loja. Um único token
-- enxerga todas as lojas vinculadas ao app, de todos os clientes. Por isso o
-- polling é global e o que precisa existir por loja é o roteamento
-- merchantId → tenant, não um par de credenciais por tenant.

-- ── 1. Token da aplicação (linha única) ─────────────────────────────────────
-- Não vai em pdv_settings por dois motivos: não é dado de tenant, e a RLS de
-- pdv_settings é "auth.uid() = user_id" para ALL sem recorte de coluna, o que
-- deixaria o token legível pelo browser com a chave anon.
-- RLS ligada e NENHUMA policy: só o service_role das edge functions enxerga.
CREATE TABLE IF NOT EXISTS public.ifood_app_token (
  -- o CHECK garante uma linha só: não existem dois tokens de aplicação
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  access_token text,
  token_expires_at timestamptz,
  -- O iFood permite 1 polling a cada 30s POR TOKEN, e aqui o token é um só
  -- para a plataforma inteira. A trava é global e é um UPDATE condicional
  -- (não leitura-depois-escrita), então duas invocações do cron não conseguem
  -- pegar a mesma janela.
  polling_lock_until timestamptz,
  last_poll_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ifood_app_token ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ifood_app_token IS
  'Token client_credentials da aplicação Velara no iFood. Linha única, sem policy de RLS: acesso só via service_role. O clientId/clientSecret ficam em secret do Supabase, nunca aqui.';

COMMENT ON COLUMN public.ifood_app_token.last_poll_at IS
  'A loja fica online no iFood ENQUANTO a integração faz polling. Envelhecer aqui significa TODAS as lojas caindo na plataforma, não apenas atraso de sincronização. É sinal de alarme, não de diagnóstico.';

-- ── 2. Roteamento merchantId → tenant ───────────────────────────────────────
-- O polling global devolve eventos de todas as lojas do app misturados. Esta
-- tabela é o que diz de quem é cada pedido. Sem ela, evento de um cliente
-- entraria na conta de outro.
CREATE TABLE IF NOT EXISTS public.ifood_merchants (
  merchant_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  corporate_name text,
  is_active boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_status jsonb,
  last_status_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ifood_merchants_user ON public.ifood_merchants (user_id);

ALTER TABLE public.ifood_merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant lê suas próprias lojas iFood" ON public.ifood_merchants;
CREATE POLICY "Tenant lê suas próprias lojas iFood"
  ON public.ifood_merchants FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.ifood_merchants IS
  'De-para merchantId → tenant. Chave primária no merchant_id porque uma loja do iFood pertence a um tenant só: é o que impede pedido de um cliente cair na conta de outro.';

-- As colunas de token em pdv_settings estão vazias e expostas ao browser. Saem
-- agora, antes que alguém volte a escrever nelas. ifood_token_expires_at
-- também sai: no modelo centralizado a expiração é da aplicação, não da loja.
ALTER TABLE public.pdv_settings
  DROP COLUMN IF EXISTS ifood_access_token,
  DROP COLUMN IF EXISTS ifood_refresh_token,
  DROP COLUMN IF EXISTS ifood_token_expires_at;

-- ── 3. Operação da integração, por loja ─────────────────────────────────────
-- Sem coluna de ambiente: o iFood não expõe host de sandbox separado. A
-- homologação roda contra lojas de teste na mesma API, então o que muda é o
-- merchant, não o endereço.
ALTER TABLE public.pdv_settings
  -- pausar o recebimento sem desvincular a loja
  ADD COLUMN IF NOT EXISTS ifood_paused boolean NOT NULL DEFAULT false,
  -- loja em foco. A lista completa vive em ifood_merchants; o código antigo
  -- pegava merchants[0] e ignorava as demais em silêncio.
  ADD COLUMN IF NOT EXISTS ifood_merchant_name text,
  -- destino de impressão dos itens que ainda não têm produto vinculado
  ADD COLUMN IF NOT EXISTS ifood_default_production_center_id uuid
    REFERENCES public.pdv_production_centers(id) ON DELETE SET NULL,
  -- não confirmar pedido quando não há ninguém operando o caixa
  ADD COLUMN IF NOT EXISTS ifood_require_open_cashier boolean NOT NULL DEFAULT true,
  -- estreia sem risco: ingere e mostra na tela, mas não confirma na plataforma
  ADD COLUMN IF NOT EXISTS ifood_shadow_mode boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ifood_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS ifood_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS ifood_last_error text,
  ADD COLUMN IF NOT EXISTS ifood_last_error_at timestamptz,
  -- alerta antes do corte da plataforma para pedido não confirmado
  ADD COLUMN IF NOT EXISTS ifood_alert_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS ifood_delivery_time_min integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS ifood_pickup_time_min integer NOT NULL DEFAULT 20;

-- Flag morta desde out/2025: gravada pela UI, sem consumidor, e prometendo um
-- módulo que ainda não existe.
COMMENT ON COLUMN public.pdv_settings.ifood_sync_menu IS
  'DEPRECADA enquanto o módulo Catalog não existir. Não exibir na UI.';

-- ── 4. Fila de eventos do polling ───────────────────────────────────────────
-- pdv_ifood_webhooks foi criada em out/2025, nasceu com RLS completa e nunca
-- teve um leitor ou escritor sequer. O nome também estava errado: o iFood
-- entrega evento por polling. Renomeada e completada em vez de duplicada.
ALTER TABLE IF EXISTS public.pdv_ifood_webhooks RENAME TO pdv_ifood_events;

ALTER TABLE public.pdv_ifood_events
  ADD COLUMN IF NOT EXISTS merchant_id text,
  ADD COLUMN IF NOT EXISTS order_external_id text,
  ADD COLUMN IF NOT EXISTS full_code text,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  -- O evento é confirmado ao iFood assim que é GRAVADO, não quando é
  -- processado. Se a busca dos detalhes do pedido falhar, ele fica aqui com
  -- processed=false e é retentado. O iFood não reenvia evento já confirmado,
  -- então esta fila é a única rede de proteção contra perder pedido.
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- user_id passa a ser opcional: o evento é gravado antes de saber de quem é.
-- Evento de merchant desconhecido fica órfão aqui em vez de ser descartado.
ALTER TABLE public.pdv_ifood_events ALTER COLUMN user_id DROP NOT NULL;

-- O acknowledgment de todo evento recebido é o critério que mais reprova
-- homologação, e o polling é repetitivo por natureza: o mesmo evento volta
-- até ser confirmado. O índice único é o que garante processar uma vez só.
-- Global, não por tenant, porque o polling é global.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ifood_events_event
  ON public.pdv_ifood_events (event_id);

CREATE INDEX IF NOT EXISTS idx_ifood_events_pending
  ON public.pdv_ifood_events (created_at)
  WHERE processed = false;

COMMENT ON COLUMN public.pdv_ifood_events.acknowledged_at IS
  'Quando o POST /events/acknowledgment devolveu 2xx para este evento. NULL = pendente de confirmação ao iFood.';

-- ── 5. Log de diagnóstico ───────────────────────────────────────────────────
-- Alimenta o painel "Últimos eventos" da tela. Faltava o código HTTP, que é o
-- que explica a falha.
ALTER TABLE public.pdv_ifood_sync_logs
  ADD COLUMN IF NOT EXISTS http_status integer;

ALTER TABLE public.pdv_ifood_sync_logs ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ifood_sync_logs_user_created
  ON public.pdv_ifood_sync_logs (user_id, created_at DESC);

-- ── 6. Campos que os critérios de homologação exigem exibir ─────────────────
-- Já existem e só precisam ser populados: change_for (troco), scheduled_for
-- (início da janela de agendamento), coupon_code, discount, e
-- delivery_order_items.notes (observação do item). Faltava o resto.
ALTER TABLE public.delivery_orders
  -- IMMEDIATE | SCHEDULED. O critério exige exibir data E hora do agendamento,
  -- então o fim da janela também precisa existir.
  ADD COLUMN IF NOT EXISTS order_timing text,
  ADD COLUMN IF NOT EXISTS scheduled_until timestamptz,
  -- critério: exibir os detalhes do tipo de pagamento com cartão
  ADD COLUMN IF NOT EXISTS external_payment_type text,
  ADD COLUMN IF NOT EXISTS external_payment_brand text,
  -- critério: exibir o valor do cupom E quem banca o desconto
  ADD COLUMN IF NOT EXISTS external_benefits jsonb,
  ADD COLUMN IF NOT EXISTS discount_sponsor_ifood numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_sponsor_merchant numeric(12,2) NOT NULL DEFAULT 0,
  -- IFOOD | MERCHANT. Define se o /dispatch se aplica: quando a logística é do
  -- iFood, quem despacha é a plataforma, não a loja.
  ADD COLUMN IF NOT EXISTS external_delivered_by text,
  -- código escolhido em /cancellationReasons, que o cancelamento exige enviar
  ADD COLUMN IF NOT EXISTS external_cancellation_code text,
  ADD COLUMN IF NOT EXISTS external_last_event_at timestamptz,
  -- critério: exibir CPF/CNPJ do cliente (quem pede nota na compra)
  ADD COLUMN IF NOT EXISTS customer_document text,
  -- critério: exibir o código de coleta. É o que o cliente informa no balcão
  -- para retirar o pedido de TAKEOUT.
  ADD COLUMN IF NOT EXISTS external_collection_code text,
  -- observação de ENTREGA (diferente da observação do item), que o critério
  -- exige aparecer na comanda impressa
  ADD COLUMN IF NOT EXISTS delivery_notes text;

COMMENT ON COLUMN public.delivery_orders.external_collection_code IS
  'Código de coleta do pedido de retirada. Exigido na tela pelos critérios de homologação do iFood.';

COMMENT ON COLUMN public.delivery_orders.external_payment_brand IS
  'Bandeira do cartão (VISA, MASTERCARD...). Exigida na tela pelos critérios de homologação do iFood.';

COMMENT ON COLUMN public.delivery_orders.external_benefits IS
  'Benefícios/descontos como vieram da plataforma, com o rateio de subsídio. discount_sponsor_ifood e discount_sponsor_merchant são a leitura já somada, para a tela não precisar interpretar jsonb.';

-- Fila do que precisa de confirmação: alimenta o alerta antes do corte.
CREATE INDEX IF NOT EXISTS idx_delivery_orders_ifood_pending
  ON public.delivery_orders (user_id, created_at)
  WHERE source = 'ifood' AND status = 'pending';

ALTER TABLE public.delivery_order_items
  -- o iFood identifica o item dentro do pedido; guardar permite reconciliar
  -- alteração de item sem duplicar linha
  ADD COLUMN IF NOT EXISTS external_unique_id text,
  ADD COLUMN IF NOT EXISTS external_index integer;

-- O gatilho de aceite automático local já ignora pedido externo desde a
-- migration da DeliveryMuch (source <> 'own'), e a regra é genérica, então
-- vale para o iFood sem alteração.
