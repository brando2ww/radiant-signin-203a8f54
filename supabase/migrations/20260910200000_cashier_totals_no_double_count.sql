-- Quebra por forma de pagamento não pode contar a mesma venda duas vezes.
--
-- `total_online_delivery` somava por `source = 'delivery_online'` sem olhar a
-- forma de pagamento, enquanto `total_pix` somava por `payment_method = 'pix'`
-- sem olhar a origem. Pedido do iFood pago por Pix na plataforma tem os dois,
-- então caía nos dois baldes: o fechamento mostrava PIX R$ 80,81 E Online
-- R$ 80,81 para uma venda de R$ 80,81 só (Koten Garibaldi, 10/09/2026).
--
-- Dinheiro nenhum foi contado a mais: `total_sales` sempre somou a venda uma
-- vez, e a conferência da gaveta usa `total_cash`, que não é afetada. O que
-- quebrava era a soma das partes, que não fechava com o total.
--
-- A origem manda: venda paga NA PLATAFORMA é "Online (Delivery)" e sai dos
-- baldes de forma de pagamento. O lojista não recebeu esse Pix na chave dele —
-- ele recebe o repasse da plataforma depois, e procurar esse valor no extrato
-- do Pix não acha nada.
CREATE OR REPLACE FUNCTION public.pdv_recompute_session_totals(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- Pago na plataforma: balde próprio, fora das formas de pagamento.
      SUM(CASE WHEN type = 'venda' AND source = 'delivery_online' THEN amount ELSE 0 END) AS total_online_delivery,
      SUM(CASE WHEN type = 'venda' AND na_casa AND payment_method = 'dinheiro' THEN amount ELSE 0 END) AS total_cash,
      SUM(CASE WHEN type = 'venda' AND na_casa AND payment_method = 'credito' THEN amount ELSE 0 END) AS total_credit,
      SUM(CASE WHEN type = 'venda' AND na_casa AND payment_method = 'debito'  THEN amount ELSE 0 END) AS total_debit,
      SUM(CASE WHEN type = 'venda' AND na_casa AND payment_method = 'pix'     THEN amount ELSE 0 END) AS total_pix,
      SUM(CASE WHEN type = 'venda' AND na_casa AND payment_method = 'vale_refeicao' THEN amount ELSE 0 END) AS total_voucher,
      SUM(CASE WHEN type = 'venda' AND na_casa AND payment_method = 'fiado' THEN amount ELSE 0 END) AS total_fiado,
      SUM(CASE WHEN type = 'venda' AND na_casa AND (payment_method IS NULL OR payment_method NOT IN ('dinheiro','credito','debito','pix','vale_refeicao','cartao','fiado')) THEN amount ELSE 0 END) AS total_other,
      SUM(CASE WHEN type = 'sangria' THEN amount ELSE 0 END) AS total_withdrawals
    FROM (
      SELECT m.*, (m.source IS DISTINCT FROM 'delivery_online') AS na_casa
      FROM public.pdv_cashier_movements m
      WHERE m.cashier_session_id = p_session_id
    ) m
  ) agg
  WHERE s.id = p_session_id;
END;
$function$;
