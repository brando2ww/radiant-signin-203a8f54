-- Extend pdv_settle_employee_consumption to accept payment_method.
-- Previously hardcoded 'dinheiro' in both pdv_employee_consumption_payments
-- and pdv_cashier_movements; now caller passes the actual method.
CREATE OR REPLACE FUNCTION public.pdv_settle_employee_consumption(
  p_employee_id uuid,
  p_amount numeric,
  p_session_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'dinheiro'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_employee RECORD;
  v_remaining numeric := p_amount;
  v_entry RECORD;
  v_pay_amount numeric;
  v_debt_left numeric;
BEGIN
  v_owner := public.pdv_resolve_owner(auth.uid());

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  SELECT * INTO v_employee FROM public.pdv_authorized_employees
    WHERE id = p_employee_id AND user_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;

  -- Distribui FIFO
  FOR v_entry IN
    SELECT * FROM public.pdv_employee_consumption_entries
    WHERE employee_id = p_employee_id AND status <> 'pago' AND user_id = v_owner
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_debt_left := v_entry.total - v_entry.paid_amount;
    v_pay_amount := LEAST(v_remaining, v_debt_left);

    UPDATE public.pdv_employee_consumption_entries
       SET paid_amount = paid_amount + v_pay_amount,
           status = CASE
             WHEN paid_amount + v_pay_amount >= total THEN 'pago'
             ELSE 'pago_parcial'
           END,
           updated_at = now()
     WHERE id = v_entry.id;

    v_remaining := v_remaining - v_pay_amount;
  END LOOP;

  -- Registra pagamento com a forma correta
  INSERT INTO public.pdv_employee_consumption_payments
    (user_id, employee_id, amount, cashier_session_id, operator_id, payment_method)
  VALUES (v_owner, p_employee_id, p_amount, p_session_id, auth.uid(), p_payment_method);

  -- Entra no caixa com a forma correta
  IF p_session_id IS NOT NULL THEN
    INSERT INTO public.pdv_cashier_movements
      (cashier_session_id, type, amount, payment_method, description, source)
    VALUES
      (p_session_id, 'venda', p_amount, p_payment_method,
       'Quitação Consumo — ' || v_employee.full_name, 'quitacao_consumo');

    PERFORM public.pdv_recompute_session_totals(p_session_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'applied', p_amount - v_remaining, 'credit', v_remaining);
END;
$function$;
