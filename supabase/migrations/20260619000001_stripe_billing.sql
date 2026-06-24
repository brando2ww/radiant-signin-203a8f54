-- ============================================================
-- Stripe Billing — Assinaturas Modulares Velara PDV
-- ============================================================

-- 1. Coluna no tenants para vincular customer Stripe
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- 2. Clientes Stripe por tenant
CREATE TABLE IF NOT EXISTS public.stripe_customers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_user_id    uuid        NOT NULL REFERENCES auth.users(id),
  stripe_customer_id text      NOT NULL UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- 3. Assinaturas por tenant
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id      text        NOT NULL,
  stripe_subscription_id  text        NOT NULL UNIQUE,
  status                  text        NOT NULL,
  plan_key                text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- 4. Items de cada assinatura (módulos individuais)
CREATE TABLE IF NOT EXISTS public.subscription_items (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id              uuid        NOT NULL REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE,
  tenant_id                    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_subscription_item_id  text        NOT NULL UNIQUE,
  stripe_price_id              text        NOT NULL,
  module_key                   text        NOT NULL,
  status                       text        NOT NULL DEFAULT 'active',
  created_at                   timestamptz NOT NULL DEFAULT now()
);

-- 5. Idempotência de webhook
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text       NOT NULL UNIQUE,
  event_type     text        NOT NULL,
  tenant_id      uuid        REFERENCES public.tenants(id),
  status         text        NOT NULL DEFAULT 'processed',
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 6. Controle de upsell
CREATE TABLE IF NOT EXISTS public.upsell_dismissals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id),
  offer_key      text        NOT NULL,
  dismissed_until timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id, offer_key)
);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.stripe_customers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upsell_dismissals    ENABLE ROW LEVEL SECURITY;

-- stripe_customers
CREATE POLICY "super_admins_manage_stripe_customers"
  ON public.stripe_customers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

CREATE POLICY "owners_read_stripe_customers"
  ON public.stripe_customers FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

-- tenant_subscriptions
CREATE POLICY "super_admins_manage_tenant_subscriptions"
  ON public.tenant_subscriptions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

CREATE POLICY "owners_read_tenant_subscriptions"
  ON public.tenant_subscriptions FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()));

-- subscription_items
CREATE POLICY "super_admins_manage_subscription_items"
  ON public.subscription_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

CREATE POLICY "owners_read_subscription_items"
  ON public.subscription_items FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()));

-- stripe_events (somente service_role escreve via webhook)
CREATE POLICY "super_admins_read_stripe_events"
  ON public.stripe_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- upsell_dismissals
CREATE POLICY "users_manage_own_upsell_dismissals"
  ON public.upsell_dismissals FOR ALL TO authenticated
  USING (user_id = auth.uid());
