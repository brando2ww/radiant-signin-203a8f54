
-- 1. Funcionários autorizados
CREATE TABLE public.pdv_authorized_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  role_title text,
  avatar_url text,
  credit_limit numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdv_authorized_employees_user ON public.pdv_authorized_employees(user_id);

ALTER TABLE public.pdv_authorized_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view authorized employees"
  ON public.pdv_authorized_employees FOR SELECT
  USING (user_id = auth.uid() OR public.is_establishment_member(user_id));

CREATE POLICY "admin insert authorized employees"
  ON public.pdv_authorized_employees FOR INSERT
  WITH CHECK (
    user_id = public.pdv_resolve_owner(auth.uid())
    AND public.pdv_user_role(auth.uid()) IN ('proprietario','gerente')
  );

CREATE POLICY "admin update authorized employees"
  ON public.pdv_authorized_employees FOR UPDATE
  USING (
    user_id = public.pdv_resolve_owner(auth.uid())
    AND public.pdv_user_role(auth.uid()) IN ('proprietario','gerente')
  );

CREATE POLICY "admin delete authorized employees"
  ON public.pdv_authorized_employees FOR DELETE
  USING (
    user_id = public.pdv_resolve_owner(auth.uid())
    AND public.pdv_user_role(auth.uid()) IN ('proprietario','gerente')
  );

CREATE TRIGGER trg_pdv_authorized_employees_updated_at
  BEFORE UPDATE ON public.pdv_authorized_employees
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Lançamentos de consumo
CREATE TABLE public.pdv_employee_consumption_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.pdv_authorized_employees(id) ON DELETE RESTRICT,
  operator_id uuid,
  comanda_id uuid,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  over_limit_justification text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_employee_consumption_entries_status_check
    CHECK (status IN ('pendente','pago_parcial','pago'))
);

CREATE INDEX idx_pdv_emp_consumption_entries_user ON public.pdv_employee_consumption_entries(user_id);
CREATE INDEX idx_pdv_emp_consumption_entries_emp ON public.pdv_employee_consumption_entries(employee_id);
CREATE INDEX idx_pdv_emp_consumption_entries_status ON public.pdv_employee_consumption_entries(status);

ALTER TABLE public.pdv_employee_consumption_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view employee consumption entries"
  ON public.pdv_employee_consumption_entries FOR SELECT
  USING (user_id = auth.uid() OR public.is_establishment_member(user_id));

CREATE POLICY "insert employee consumption entries"
  ON public.pdv_employee_consumption_entries FOR INSERT
  WITH CHECK (user_id = public.pdv_resolve_owner(auth.uid()));

CREATE POLICY "update employee consumption entries"
  ON public.pdv_employee_consumption_entries FOR UPDATE
  USING (user_id = public.pdv_resolve_owner(auth.uid()));

CREATE TRIGGER trg_pdv_emp_consumption_entries_updated_at
  BEFORE UPDATE ON public.pdv_employee_consumption_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. Quitações (pagamentos)
CREATE TABLE public.pdv_employee_consumption_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.pdv_authorized_employees(id) ON DELETE RESTRICT,
  amount numeric NOT NULL,
  cashier_session_id uuid,
  operator_id uuid,
  payment_method text NOT NULL DEFAULT 'dinheiro',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdv_emp_consumption_payments_user ON public.pdv_employee_consumption_payments(user_id);
CREATE INDEX idx_pdv_emp_consumption_payments_emp ON public.pdv_employee_consumption_payments(employee_id);

ALTER TABLE public.pdv_employee_consumption_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view employee consumption payments"
  ON public.pdv_employee_consumption_payments FOR SELECT
  USING (user_id = auth.uid() OR public.is_establishment_member(user_id));

CREATE POLICY "insert employee consumption payments"
  ON public.pdv_employee_consumption_payments FOR INSERT
  WITH CHECK (user_id = public.pdv_resolve_owner(auth.uid()));

-- 4. Adicionar 'quitacao_consumo' como source válido em pdv_cashier_movements
ALTER TABLE public.pdv_cashier_movements DROP CONSTRAINT IF EXISTS pdv_cashier_movements_source_check;
ALTER TABLE public.pdv_cashier_movements
  ADD CONSTRAINT pdv_cashier_movements_source_check
  CHECK (source IS NULL OR source = ANY (ARRAY['salon','counter','delivery','delivery_online','quitacao_consumo']));

-- 5. RPC: registrar consumo
CREATE OR REPLACE FUNCTION public.pdv_register_employee_consumption(
  p_employee_id uuid,
  p_items jsonb,
  p_justification text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_employee RECORD;
  v_total numeric := 0;
  v_item jsonb;
  v_current_debt numeric;
  v_entry_id uuid;
  v_new_debt numeric;
BEGIN
  v_owner := public.pdv_resolve_owner(auth.uid());

  SELECT * INTO v_employee FROM public.pdv_authorized_employees
    WHERE id = p_employee_id AND user_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;
  IF NOT v_employee.is_active THEN RAISE EXCEPTION 'Funcionário inativo'; END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum item informado';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_total := v_total + (COALESCE((v_item->>'quantity')::numeric, 1) * COALESCE((v_item->>'unit_price')::numeric, 0));
  END LOOP;

  SELECT COALESCE(SUM(total - paid_amount), 0) INTO v_current_debt
    FROM public.pdv_employee_consumption_entries
    WHERE employee_id = p_employee_id AND status <> 'pago';

  v_new_debt := v_current_debt + v_total;

  IF v_employee.credit_limit > 0 AND v_new_debt > v_employee.credit_limit
     AND (p_justification IS NULL OR length(trim(p_justification)) < 5) THEN
    RAISE EXCEPTION 'Limite de crédito excedido — justificativa obrigatória';
  END IF;

  INSERT INTO public.pdv_employee_consumption_entries
    (user_id, employee_id, operator_id, total, items, over_limit_justification)
  VALUES
    (v_owner, p_employee_id, auth.uid(), v_total, p_items,
     CASE WHEN v_employee.credit_limit > 0 AND v_new_debt > v_employee.credit_limit
          THEN p_justification ELSE NULL END)
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_entry_id, 'total', v_total, 'new_debt', v_new_debt);
END;
$$;

-- 6. RPC: quitar saldo (FIFO)
CREATE OR REPLACE FUNCTION public.pdv_settle_employee_consumption(
  p_employee_id uuid,
  p_amount numeric,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Registra pagamento
  INSERT INTO public.pdv_employee_consumption_payments
    (user_id, employee_id, amount, cashier_session_id, operator_id, payment_method)
  VALUES (v_owner, p_employee_id, p_amount, p_session_id, auth.uid(), 'dinheiro');

  -- Entra no caixa
  IF p_session_id IS NOT NULL THEN
    INSERT INTO public.pdv_cashier_movements
      (cashier_session_id, type, amount, payment_method, description, source)
    VALUES
      (p_session_id, 'venda', p_amount, 'dinheiro',
       'Quitação Consumo — ' || v_employee.full_name, 'quitacao_consumo');

    PERFORM public.pdv_recompute_session_totals(p_session_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'applied', p_amount - v_remaining, 'credit', v_remaining);
END;
$$;
