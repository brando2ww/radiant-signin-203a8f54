
-- =========================================================================
-- FASE 1: Acúmulo server-side + idempotência + colunas de expiração
-- =========================================================================

ALTER TABLE public.delivery_loyalty_points
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

ALTER TABLE public.delivery_loyalty_settings
  ADD COLUMN IF NOT EXISTS points_expire_days int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_session_minutes int NOT NULL DEFAULT 30;

-- Idempotência por (user, customer, reference, type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_loyalty_points_reference
  ON public.delivery_loyalty_points (user_id, customer_id, type, reference_id)
  WHERE reference_id IS NOT NULL;

-- Função que credita pontos ao concluir o pedido (idempotente)
CREATE OR REPLACE FUNCTION public.earn_points_for_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_settings RECORD;
  v_points int;
  v_expires timestamptz;
BEGIN
  SELECT id, user_id, customer_id, total, status
    INTO v_order
  FROM public.delivery_orders
  WHERE id = _order_id;

  IF NOT FOUND OR v_order.customer_id IS NULL OR v_order.status <> 'completed' THEN
    RETURN;
  END IF;

  SELECT points_per_real, is_active, points_expire_days
    INTO v_settings
  FROM public.delivery_loyalty_settings
  WHERE user_id = v_order.user_id
  LIMIT 1;

  IF NOT FOUND OR NOT v_settings.is_active THEN
    RETURN;
  END IF;

  v_points := floor(COALESCE(v_order.total, 0) * COALESCE(v_settings.points_per_real, 0))::int;
  IF v_points <= 0 THEN
    RETURN;
  END IF;

  IF COALESCE(v_settings.points_expire_days, 0) > 0 THEN
    v_expires := now() + (v_settings.points_expire_days || ' days')::interval;
  ELSE
    v_expires := NULL;
  END IF;

  INSERT INTO public.delivery_loyalty_points
    (user_id, customer_id, points, type, reference_id, description, expires_at)
  VALUES
    (v_order.user_id, v_order.customer_id, v_points, 'earn',
     v_order.id::text,
     'Pedido #' || COALESCE((SELECT order_number FROM public.delivery_orders WHERE id = v_order.id), substring(v_order.id::text, 1, 8)),
     v_expires)
  ON CONFLICT (user_id, customer_id, type, reference_id) DO NOTHING;
END;
$$;

-- Função de estorno quando pedido é cancelado depois de creditado
CREATE OR REPLACE FUNCTION public.refund_points_for_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_earn RECORD;
BEGIN
  SELECT id, user_id, customer_id, points
    INTO v_earn
  FROM public.delivery_loyalty_points
  WHERE type = 'earn' AND reference_id = _order_id::text
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.delivery_loyalty_points
    (user_id, customer_id, points, type, reference_id, description)
  VALUES
    (v_earn.user_id, v_earn.customer_id, -v_earn.points, 'refund',
     _order_id::text || ':refund', 'Estorno por cancelamento do pedido')
  ON CONFLICT (user_id, customer_id, type, reference_id) DO NOTHING;
END;
$$;

-- Trigger no delivery_orders
CREATE OR REPLACE FUNCTION public.delivery_orders_loyalty_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') IS DISTINCT FROM 'completed' THEN
    BEGIN
      PERFORM public.earn_points_for_order(NEW.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  ELSIF NEW.status = 'cancelled' AND COALESCE(OLD.status, '') = 'completed' THEN
    BEGIN
      PERFORM public.refund_points_for_order(NEW.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_orders_loyalty ON public.delivery_orders;
CREATE TRIGGER trg_delivery_orders_loyalty
  AFTER UPDATE OF status ON public.delivery_orders
  FOR EACH ROW EXECUTE FUNCTION public.delivery_orders_loyalty_trigger();

-- =========================================================================
-- FASE 3 (schema): tabela de sessões OTP
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.delivery_customer_otp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  phone text NOT NULL,
  code_hash text NOT NULL,
  code_expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  verified_at timestamptz NULL,
  session_token uuid NULL,
  session_expires_at timestamptz NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dc_otp_user_phone ON public.delivery_customer_otp_sessions (user_id, phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dc_otp_token ON public.delivery_customer_otp_sessions (session_token) WHERE session_token IS NOT NULL;

GRANT ALL ON public.delivery_customer_otp_sessions TO service_role;
ALTER TABLE public.delivery_customer_otp_sessions ENABLE ROW LEVEL SECURITY;
-- nenhuma policy: bloqueado para anon/authenticated; somente service_role / SECURITY DEFINER

-- Helper: resolver sessão -> (user_id, customer_id)
CREATE OR REPLACE FUNCTION public.loyalty_resolve_session(_session_token uuid)
RETURNS TABLE(user_id uuid, customer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, s.customer_id
  FROM public.delivery_customer_otp_sessions s
  WHERE s.session_token = _session_token
    AND s.verified_at IS NOT NULL
    AND s.session_expires_at > now()
  ORDER BY s.created_at DESC
  LIMIT 1
$$;

-- RPCs públicas: saldo, histórico, resgates
CREATE OR REPLACE FUNCTION public.loyalty_get_balance(_session_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid; v_customer uuid;
  v_balance int;
  v_expiring int;
BEGIN
  SELECT user_id, customer_id INTO v_user, v_customer FROM public.loyalty_resolve_session(_session_token);
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT COALESCE(SUM(points), 0) INTO v_balance
  FROM public.delivery_loyalty_points
  WHERE user_id = v_user AND customer_id = v_customer;

  SELECT COALESCE(SUM(points), 0) INTO v_expiring
  FROM public.delivery_loyalty_points
  WHERE user_id = v_user AND customer_id = v_customer
    AND type = 'earn' AND expires_at IS NOT NULL
    AND expires_at <= now() + interval '30 days'
    AND expires_at > now();

  RETURN jsonb_build_object('balance', v_balance, 'expiring_soon', v_expiring);
END;
$$;

CREATE OR REPLACE FUNCTION public.loyalty_get_history(_session_token uuid)
RETURNS SETOF public.delivery_loyalty_points
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid; v_customer uuid;
BEGIN
  SELECT user_id, customer_id INTO v_user, v_customer FROM public.loyalty_resolve_session(_session_token);
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  RETURN QUERY
  SELECT * FROM public.delivery_loyalty_points
  WHERE user_id = v_user AND customer_id = v_customer
  ORDER BY created_at DESC
  LIMIT 50;
END;
$$;

-- =========================================================================
-- FASE 4: resgate de cashback com validação server-side
-- =========================================================================
CREATE OR REPLACE FUNCTION public.redeem_cashback(_session_token uuid, _order_id uuid, _points int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid; v_customer uuid;
  v_balance int;
  v_new_balance int;
BEGIN
  IF _points <= 0 THEN RAISE EXCEPTION 'invalid_points'; END IF;

  SELECT user_id, customer_id INTO v_user, v_customer FROM public.loyalty_resolve_session(_session_token);
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_customer::text));

  SELECT COALESCE(SUM(points), 0) INTO v_balance
  FROM public.delivery_loyalty_points
  WHERE user_id = v_user AND customer_id = v_customer;

  IF v_balance < _points THEN RAISE EXCEPTION 'insufficient_points'; END IF;

  INSERT INTO public.delivery_loyalty_points
    (user_id, customer_id, points, type, reference_id, description)
  VALUES
    (v_user, v_customer, -_points, 'redeem',
     COALESCE(_order_id::text, gen_random_uuid()::text),
     'Cashback resgatado')
  ON CONFLICT (user_id, customer_id, type, reference_id) DO NOTHING;

  v_new_balance := v_balance - _points;
  RETURN jsonb_build_object('new_balance', v_new_balance, 'redeemed', _points);
END;
$$;

-- =========================================================================
-- FASE 5: redeem_loyalty_prize por sessão OTP
-- =========================================================================
DROP FUNCTION IF EXISTS public.redeem_loyalty_prize(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.redeem_loyalty_prize(_session_token uuid, _prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid; v_customer uuid;
  v_prize RECORD;
  v_balance int;
BEGIN
  SELECT user_id, customer_id INTO v_user, v_customer FROM public.loyalty_resolve_session(_session_token);
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO v_prize FROM public.delivery_loyalty_prizes WHERE id = _prize_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'prize_not_found'; END IF;
  IF NOT v_prize.is_active THEN RAISE EXCEPTION 'prize_inactive'; END IF;
  IF v_prize.max_quantity IS NOT NULL AND v_prize.redeemed_count >= v_prize.max_quantity THEN
    RAISE EXCEPTION 'prize_sold_out';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_customer::text));

  SELECT COALESCE(SUM(points), 0) INTO v_balance
  FROM public.delivery_loyalty_points
  WHERE user_id = v_user AND customer_id = v_customer;

  IF v_balance < v_prize.points_cost THEN RAISE EXCEPTION 'insufficient_points'; END IF;

  INSERT INTO public.delivery_loyalty_points
    (user_id, customer_id, points, type, reference_id, description)
  VALUES
    (v_user, v_customer, -v_prize.points_cost, 'redeem',
     'prize:' || v_prize.id::text || ':' || gen_random_uuid()::text,
     'Resgate de prêmio: ' || v_prize.name);

  UPDATE public.delivery_loyalty_prizes
     SET redeemed_count = redeemed_count + 1
   WHERE id = v_prize.id;

  RETURN jsonb_build_object('new_balance', v_balance - v_prize.points_cost, 'prize_name', v_prize.name);
END;
$$;

-- =========================================================================
-- FASE 7: expiração diária de pontos
-- =========================================================================
CREATE OR REPLACE FUNCTION public.expire_loyalty_points()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  WITH to_expire AS (
    SELECT p.id, p.user_id, p.customer_id, p.points
    FROM public.delivery_loyalty_points p
    WHERE p.type = 'earn'
      AND p.expires_at IS NOT NULL
      AND p.expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_loyalty_points e
        WHERE e.type = 'expire'
          AND e.reference_id = p.id::text || ':expire'
      )
  ),
  inserted AS (
    INSERT INTO public.delivery_loyalty_points
      (user_id, customer_id, points, type, reference_id, description)
    SELECT user_id, customer_id, -points, 'expire', id::text || ':expire', 'Pontos expirados'
    FROM to_expire
    ON CONFLICT (user_id, customer_id, type, reference_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

-- =========================================================================
-- FASE 2: fechar RLS de delivery_loyalty_points
-- =========================================================================
DROP POLICY IF EXISTS "Public can view loyalty points" ON public.delivery_loyalty_points;
DROP POLICY IF EXISTS "Anon can insert loyalty points" ON public.delivery_loyalty_points;

REVOKE INSERT, UPDATE, DELETE, SELECT ON public.delivery_loyalty_points FROM anon;
GRANT SELECT ON public.delivery_loyalty_points TO authenticated;
GRANT ALL ON public.delivery_loyalty_points TO service_role;

-- Permitir uso público das RPCs SECURITY DEFINER por anon
GRANT EXECUTE ON FUNCTION public.loyalty_get_balance(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_get_history(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_cashback(uuid, uuid, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_prize(uuid, uuid) TO anon, authenticated;
