ALTER TABLE public.pdv_cashier_sessions
  ADD COLUMN IF NOT EXISTS total_fiado numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.pdv_recompute_session_totals(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pdv_cashier_sessions s
  SET
    total_sales = COALESCE(agg.total_sales, 0),
    total_cash = COALESCE(agg.total_cash, 0),
    total_credit = COALESCE(agg.total_credit, 0),
    total_debit = COALESCE(agg.total_debit, 0),
    total_card = COALESCE(agg.total_credit, 0) + COALESCE(agg.total_debit, 0),
    total_pix = COALESCE(agg.total_pix, 0),
    total_voucher = COALESCE(agg.total_voucher, 0),
    total_online_delivery = COALESCE(agg.total_online_delivery, 0),
    total_fiado = COALESCE(agg.total_fiado, 0),
    total_other = COALESCE(agg.total_other, 0),
    total_withdrawals = COALESCE(agg.total_withdrawals, 0)
  FROM (
    SELECT
      SUM(CASE WHEN type = 'venda' THEN amount ELSE 0 END) AS total_sales,
      SUM(CASE WHEN type = 'venda' AND payment_method = 'dinheiro' THEN amount ELSE 0 END) AS total_cash,
      SUM(CASE WHEN type = 'venda' AND payment_method = 'credito' THEN amount ELSE 0 END) AS total_credit,
      SUM(CASE WHEN type = 'venda' AND payment_method = 'debito'  THEN amount ELSE 0 END) AS total_debit,
      SUM(CASE WHEN type = 'venda' AND payment_method = 'pix'     THEN amount ELSE 0 END) AS total_pix,
      SUM(CASE WHEN type = 'venda' AND payment_method = 'vale_refeicao' THEN amount ELSE 0 END) AS total_voucher,
      SUM(CASE WHEN type = 'venda' AND source = 'delivery_online' THEN amount ELSE 0 END) AS total_online_delivery,
      SUM(CASE WHEN type = 'venda' AND payment_method = 'fiado' THEN amount ELSE 0 END) AS total_fiado,
      SUM(CASE WHEN type = 'venda' AND (payment_method IS NULL OR payment_method NOT IN ('dinheiro','credito','debito','pix','vale_refeicao','cartao','fiado')) THEN amount ELSE 0 END) AS total_other,
      SUM(CASE WHEN type = 'sangria' THEN amount ELSE 0 END) AS total_withdrawals
    FROM public.pdv_cashier_movements
    WHERE cashier_session_id = p_session_id
  ) agg
  WHERE s.id = p_session_id;
END;
$$;

-- Backfill sessões abertas
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.pdv_cashier_sessions WHERE closed_at IS NULL LOOP
    PERFORM public.pdv_recompute_session_totals(r.id);
  END LOOP;
END $$;