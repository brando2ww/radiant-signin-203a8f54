-- DeliveryMuch · ingestão de pedidos e de-para de produtos e pagamentos
--
-- Decisão de arquitetura: o pedido da DeliveryMuch entra em delivery_orders,
-- não numa tabela paralela. O KDS, os relatórios, a baixa de estoque e o sweep
-- de impressão já leem de lá, então o pedido externo nasce integrado ao resto
-- do sistema em vez de virar uma ilha.

-- ── 1. Origem e rastreio do pedido externo ──────────────────────────────────
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS external_code text,
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS external_stage text,
  ADD COLUMN IF NOT EXISTS external_payload jsonb,
  ADD COLUMN IF NOT EXISTS external_synced_at timestamptz;

-- Idempotência: o polling é repetitivo por natureza e não pode duplicar pedido.
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_orders_external
  ON public.delivery_orders (user_id, source, external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_source_status
  ON public.delivery_orders (user_id, source, status)
  WHERE source <> 'own';

ALTER TABLE public.delivery_order_items
  ADD COLUMN IF NOT EXISTS external_product_id text,
  ADD COLUMN IF NOT EXISTS external_name text,
  -- guarda tamanho, sabores e adicionais como vieram, para a comanda impressa
  -- mostrar o pedido exatamente como o cliente montou
  ADD COLUMN IF NOT EXISTS external_options jsonb;

-- ── 2. O aceite automático local não pode valer para pedido externo ─────────
-- auto_accept_delivery_order() vira o status para 'preparing' sem avisar
-- ninguém. Num pedido da DeliveryMuch isso seria desastroso: o PDV mostraria
-- "preparando" enquanto a plataforma segue esperando o aceite, e em 15 minutos
-- o pedido é cancelado e a loja cai. Quem aceita pedido externo é a edge
-- function, que só muda o status local depois que a plataforma confirmou.
CREATE OR REPLACE FUNCTION public.auto_accept_delivery_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auto boolean;
  v_session uuid;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- pedidos de plataformas externas são aceitos pela integração, não aqui
  IF COALESCE(NEW.source, 'own') <> 'own' THEN
    RETURN NEW;
  END IF;

  SELECT auto_accept_orders INTO v_auto
    FROM public.delivery_settings
   WHERE user_id = NEW.user_id
   LIMIT 1;

  IF NOT COALESCE(v_auto, false) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_session
    FROM public.pdv_cashier_sessions
   WHERE user_id = NEW.user_id
     AND closed_at IS NULL
   ORDER BY opened_at DESC
   LIMIT 1;

  IF v_session IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.status := 'preparing';
  NEW.confirmed_at := now();

  RETURN NEW;
END;
$function$;

-- ── 3. Configuração da operação ─────────────────────────────────────────────
ALTER TABLE public.pdv_settings
  -- pausar o recebimento sem desconectar a loja da plataforma
  ADD COLUMN IF NOT EXISTS deliverymuch_paused boolean NOT NULL DEFAULT false,
  -- destino de impressão dos itens que ainda não têm produto vinculado
  ADD COLUMN IF NOT EXISTS deliverymuch_default_production_center_id uuid
    REFERENCES public.pdv_production_centers(id) ON DELETE SET NULL,
  -- não aceitar pedido quando não há ninguém operando o caixa
  ADD COLUMN IF NOT EXISTS deliverymuch_require_open_cashier boolean NOT NULL DEFAULT true,
  -- alerta antes do corte de 15 min da plataforma
  ADD COLUMN IF NOT EXISTS deliverymuch_alert_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS deliverymuch_last_poll_at timestamptz;

-- ── 4. De-para de produtos ──────────────────────────────────────────────────
-- A API da DeliveryMuch não expõe catálogo: o produto só aparece dentro do
-- pedido. Então o vínculo é descoberto, não importado. Item sem vínculo NÃO
-- impede o pedido de entrar; ele entra com o nome da plataforma e cai na fila
-- de vinculação.
CREATE TABLE IF NOT EXISTS public.deliverymuch_product_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  external_name text,
  delivery_product_id uuid REFERENCES public.delivery_products(id) ON DELETE SET NULL,
  production_center_id uuid REFERENCES public.pdv_production_centers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'mapped', 'ignored')),
  times_seen integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_product_id)
);

CREATE INDEX IF NOT EXISTS idx_deliverymuch_product_map_pending
  ON public.deliverymuch_product_map (user_id, status);

ALTER TABLE public.deliverymuch_product_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant gerencia seu de-para de produtos" ON public.deliverymuch_product_map;
CREATE POLICY "Tenant gerencia seu de-para de produtos"
  ON public.deliverymuch_product_map
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_deliverymuch_product_map_updated_at ON public.deliverymuch_product_map;
CREATE TRIGGER update_deliverymuch_product_map_updated_at
  BEFORE UPDATE ON public.deliverymuch_product_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 5. De-para de pagamentos ────────────────────────────────────────────────
-- A DeliveryMuch tem três métodos (MONEY, MACHINE, ONLINE) e o Pix conta como
-- online. Em MACHINE o que importa é o cartão, e o GET /companies/{uuid}
-- devolve os cartões aceitos por loja, então a semeadura é automática.
-- external_key: 'MONEY', 'ONLINE' ou 'MACHINE:<card_id>'.
CREATE TABLE IF NOT EXISTS public.deliverymuch_payment_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_key text NOT NULL,
  label text,
  payment_method text NOT NULL,
  -- pago antes da entrega: não deve virar cobrança na porta nem exigir troco
  is_prepaid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_key)
);

ALTER TABLE public.deliverymuch_payment_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant gerencia seu de-para de pagamentos" ON public.deliverymuch_payment_map;
CREATE POLICY "Tenant gerencia seu de-para de pagamentos"
  ON public.deliverymuch_payment_map
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_deliverymuch_payment_map_updated_at ON public.deliverymuch_payment_map;
CREATE TRIGGER update_deliverymuch_payment_map_updated_at
  BEFORE UPDATE ON public.deliverymuch_payment_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 6. Fila de pedidos externos em risco (alimenta o alerta na tela) ────────
-- Pedido não aceito em 15 minutos é cancelado pela plataforma E derruba a loja.
-- Esta view é o que o PDV observa para gritar antes disso acontecer.
CREATE OR REPLACE VIEW public.vw_deliverymuch_pending_orders
WITH (security_invoker = true)
AS
SELECT
  o.id,
  o.user_id,
  o.external_order_id,
  o.external_code,
  o.order_number,
  o.customer_name,
  o.total,
  o.order_type,
  o.created_at,
  EXTRACT(EPOCH FROM (now() - o.created_at)) / 60 AS minutes_waiting
FROM public.delivery_orders o
WHERE o.source = 'deliverymuch'
  AND o.status = 'pending'
  AND o.external_stage = 'WAITING_COMPANY';
