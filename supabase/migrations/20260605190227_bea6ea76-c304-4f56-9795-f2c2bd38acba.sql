DROP FUNCTION IF EXISTS public.loyalty_get_balance(uuid);
DROP FUNCTION IF EXISTS public.loyalty_get_history(uuid);
DROP FUNCTION IF EXISTS public.redeem_cashback(uuid, uuid, int);
DROP FUNCTION IF EXISTS public.redeem_loyalty_prize(uuid, uuid);
DROP FUNCTION IF EXISTS public.loyalty_resolve_session(uuid);

DROP TABLE IF EXISTS public.delivery_customer_otp_sessions;

ALTER TABLE public.delivery_loyalty_settings
  DROP COLUMN IF EXISTS otp_session_minutes;

CREATE OR REPLACE FUNCTION public.loyalty_current_customer()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.delivery_customers
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.loyalty_get_balance(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_balance int;
  v_expiring int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('balance', 0, 'expiring_soon', 0, 'authenticated', false);
  END IF;

  v_customer := public.loyalty_current_customer();
  IF v_customer IS NULL THEN
    RETURN jsonb_build_object('balance', 0, 'expiring_soon', 0, 'authenticated', true, 'linked', false);
  END IF;

  SELECT COALESCE(SUM(points), 0) INTO v_balance
  FROM public.delivery_loyalty_points
  WHERE user_id = _user_id AND customer_id = v_customer;

  SELECT COALESCE(SUM(points), 0) INTO v_expiring
  FROM public.delivery_loyalty_points
  WHERE user_id = _user_id
    AND customer_id = v_customer
    AND type = 'earn'
    AND expires_at IS NOT NULL
    AND expires_at <= now() + interval '30 days'
    AND expires_at > now();

  RETURN jsonb_build_object(
    'balance', v_balance,
    'expiring_soon', v_expiring,
    'authenticated', true,
    'linked', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.loyalty_get_history(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_customer := public.loyalty_current_customer();
  IF v_customer IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'points', points,
      'type', type,
      'description', description,
      'reference_id', reference_id,
      'created_at', created_at,
      'expires_at', expires_at
    ) AS t
    FROM public.delivery_loyalty_points
    WHERE user_id = _user_id AND customer_id = v_customer
    ORDER BY created_at DESC
    LIMIT 100
  ) s;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_cashback(_user_id uuid, _order_id uuid, _points int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_balance int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF _points IS NULL OR _points <= 0 THEN
    RAISE EXCEPTION 'invalid_points';
  END IF;

  v_customer := public.loyalty_current_customer();
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'customer_not_linked';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_customer::text));

  SELECT COALESCE(SUM(points), 0) INTO v_balance
  FROM public.delivery_loyalty_points
  WHERE user_id = _user_id AND customer_id = v_customer;

  IF v_balance < _points THEN
    RAISE EXCEPTION 'insufficient_points';
  END IF;

  INSERT INTO public.delivery_loyalty_points
    (user_id, customer_id, points, type, reference_id, description)
  VALUES
    (_user_id, v_customer, -_points, 'redeem',
     COALESCE(_order_id::text, gen_random_uuid()::text) || ':cashback',
     'Cashback aplicado')
  ON CONFLICT (user_id, customer_id, type, reference_id) DO NOTHING;

  RETURN jsonb_build_object('new_balance', v_balance - _points, 'redeemed', _points);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_prize(_user_id uuid, _prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_balance int;
  v_prize record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  v_customer := public.loyalty_current_customer();
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'customer_not_linked';
  END IF;

  SELECT * INTO v_prize FROM public.delivery_loyalty_prizes
   WHERE id = _prize_id AND user_id = _user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'prize_not_available';
  END IF;
  IF v_prize.max_quantity IS NOT NULL AND v_prize.redeemed_count >= v_prize.max_quantity THEN
    RAISE EXCEPTION 'prize_out_of_stock';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_customer::text));

  SELECT COALESCE(SUM(points), 0) INTO v_balance
  FROM public.delivery_loyalty_points
  WHERE user_id = _user_id AND customer_id = v_customer;

  IF v_balance < v_prize.points_cost THEN
    RAISE EXCEPTION 'insufficient_points';
  END IF;

  INSERT INTO public.delivery_loyalty_points
    (user_id, customer_id, points, type, reference_id, description)
  VALUES
    (_user_id, v_customer, -v_prize.points_cost, 'redeem',
     _prize_id::text || ':prize:' || gen_random_uuid()::text,
     'Resgate: ' || v_prize.name);

  UPDATE public.delivery_loyalty_prizes
     SET redeemed_count = COALESCE(redeemed_count, 0) + 1
   WHERE id = _prize_id;

  RETURN jsonb_build_object(
    'new_balance', v_balance - v_prize.points_cost,
    'prize_name', v_prize.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.loyalty_current_customer() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_get_balance(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_get_history(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_cashback(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_prize(uuid, uuid) TO authenticated;