-- DeliveryMuch · fundação da integração (multi-tenant)
--
-- Contexto: a migração 20260623000002 nunca chegou a produção e modelava a
-- integração de forma incorreta (token no pdv_settings, "restaurant_uuid" vindo
-- da claim errada, login por e-mail). Esta migração é a fonte da verdade.
--
-- Modelo de credenciais da DeliveryMuch:
--   · client_id/client_secret  -> da APLICAÇÃO (Velara), ficam em secret da edge function
--   · username/password        -> da LOJA, por tenant, nunca persistidos
--   · access/refresh token     -> por tenant, tabela isolada sem acesso do browser
--   · company uuid             -> vem da claim https://deliverymuch.com.br/user_claims

-- ── 1. Remove o modelo antigo (no-op em produção, onde nunca existiu) ────────
ALTER TABLE public.pdv_settings
  DROP COLUMN IF EXISTS deliverymuch_access_token,
  DROP COLUMN IF EXISTS deliverymuch_token_expires_at,
  DROP COLUMN IF EXISTS deliverymuch_restaurant_uuid,
  DROP COLUMN IF EXISTS deliverymuch_email;

-- ── 2. Configuração por tenant (sem segredo algum aqui) ─────────────────────
ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS deliverymuch_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deliverymuch_username text,
  ADD COLUMN IF NOT EXISTS deliverymuch_company_uuid text,
  ADD COLUMN IF NOT EXISTS deliverymuch_companies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deliverymuch_env text NOT NULL DEFAULT 'dev',
  -- aceite automático nasce ligado de propósito: pedido não aceito em 15 min é
  -- cancelado pela plataforma E a loja é colocada offline.
  ADD COLUMN IF NOT EXISTS deliverymuch_auto_accept boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deliverymuch_delivery_time_min integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS deliverymuch_pickup_time_min integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS deliverymuch_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS deliverymuch_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS deliverymuch_last_error text,
  ADD COLUMN IF NOT EXISTS deliverymuch_last_error_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.pdv_settings
    ADD CONSTRAINT pdv_settings_deliverymuch_env_check
    CHECK (deliverymuch_env IN ('dev', 'prod'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Tokens: tabela isolada, invisível para o browser ─────────────────────
-- A RLS de pdv_settings é "auth.uid() = user_id" para ALL, sem recorte de
-- coluna. Qualquer token guardado lá é lido pelo front com a chave anon. Como
-- o access_token da DeliveryMuch carrega o escopo write:orders, ele fica aqui:
-- RLS ligada e NENHUMA policy, então só o service_role enxerga.
CREATE TABLE IF NOT EXISTS public.deliverymuch_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  claims jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deliverymuch_credentials ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_deliverymuch_credentials_updated_at ON public.deliverymuch_credentials;
CREATE TRIGGER update_deliverymuch_credentials_updated_at
  BEFORE UPDATE ON public.deliverymuch_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.deliverymuch_credentials IS
  'Tokens OAuth da DeliveryMuch por tenant. RLS sem policy: acesso só via service_role (edge functions). A senha da loja nunca é persistida.';

-- ── 4. Log de sincronização (alimenta a saúde da integração na tela) ────────
CREATE TABLE IF NOT EXISTS public.deliverymuch_sync_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'error')),
  http_status integer,
  message text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverymuch_sync_log_user_created
  ON public.deliverymuch_sync_log (user_id, created_at DESC);

ALTER TABLE public.deliverymuch_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant lê seu próprio log DeliveryMuch" ON public.deliverymuch_sync_log;
CREATE POLICY "Tenant lê seu próprio log DeliveryMuch"
  ON public.deliverymuch_sync_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Retenção: o log é diagnóstico, não histórico contábil.
CREATE OR REPLACE FUNCTION public.prune_deliverymuch_sync_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.deliverymuch_sync_log
  WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;
