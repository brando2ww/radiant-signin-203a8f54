-- Public read of loyalty settings (program rules are not sensitive)
CREATE POLICY "Public can view loyalty settings"
  ON public.delivery_loyalty_settings
  FOR SELECT
  USING (true);

-- Public read of loyalty points (customer needs to see own balance/history)
CREATE POLICY "Public can view loyalty points"
  ON public.delivery_loyalty_points
  FOR SELECT
  USING (true);

-- Secure RPC for prize redemption
CREATE OR REPLACE FUNCTION public.redeem_loyalty_prize(
  _user_id uuid,
  _customer_id uuid,
  _prize_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prize public.delivery_loyalty_prizes%ROWTYPE;
  v_balance int;
  v_redemption_id uuid;
BEGIN
  SELECT * INTO v_prize
    FROM public.delivery_loyalty_prizes
   WHERE id = _prize_id
     AND user_id = _user_id
     AND is_active = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prêmio indisponível';
  END IF;

  IF v_prize.max_quantity IS NOT NULL
     AND v_prize.redeemed_count >= v_prize.max_quantity THEN
    RAISE EXCEPTION 'Prêmio esgotado';
  END IF;

  SELECT COALESCE(SUM(points), 0) INTO v_balance
    FROM public.delivery_loyalty_points
   WHERE user_id = _user_id
     AND customer_id = _customer_id;

  IF v_balance < v_prize.points_cost THEN
    RAISE EXCEPTION 'Pontos insuficientes';
  END IF;

  INSERT INTO public.delivery_loyalty_points
    (user_id, customer_id, points, type, reference_id, description)
  VALUES
    (_user_id, _customer_id, -v_prize.points_cost, 'redeem', _prize_id::text, 'Resgate: ' || v_prize.name)
  RETURNING id INTO v_redemption_id;

  UPDATE public.delivery_loyalty_prizes
     SET redeemed_count = redeemed_count + 1
   WHERE id = _prize_id;

  RETURN v_redemption_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_loyalty_prize(uuid, uuid, uuid) TO anon, authenticated;