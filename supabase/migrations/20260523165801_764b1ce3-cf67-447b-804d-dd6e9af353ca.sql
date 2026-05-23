
ALTER TABLE public.pdv_employee_consumption_entries
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason text,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE public.pdv_employee_consumption_entries
   SET subtotal = total
 WHERE subtotal = 0 AND total > 0;

CREATE OR REPLACE FUNCTION public.pdv_register_employee_consumption(
  p_employee_id uuid,
  p_items jsonb,
  p_justification text DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_discount_reason text DEFAULT NULL,
  p_coupon_code text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_employee RECORD;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_discount numeric := COALESCE(p_discount, 0);
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
    v_subtotal := v_subtotal + (COALESCE((v_item->>'quantity')::numeric, 1) * COALESCE((v_item->>'unit_price')::numeric, 0));
  END LOOP;

  IF v_discount < 0 THEN v_discount := 0; END IF;
  IF v_discount > v_subtotal THEN v_discount := v_subtotal; END IF;

  v_total := GREATEST(0, v_subtotal - v_discount);

  SELECT COALESCE(SUM(total - paid_amount), 0) INTO v_current_debt
    FROM public.pdv_employee_consumption_entries
    WHERE employee_id = p_employee_id AND status <> 'pago';

  v_new_debt := v_current_debt + v_total;

  IF v_employee.credit_limit > 0 AND v_new_debt > v_employee.credit_limit
     AND (p_justification IS NULL OR length(trim(p_justification)) < 5) THEN
    RAISE EXCEPTION 'Limite de crédito excedido — justificativa obrigatória';
  END IF;

  INSERT INTO public.pdv_employee_consumption_entries
    (user_id, employee_id, operator_id, subtotal, discount, discount_reason,
     coupon_code, notes, total, items, over_limit_justification)
  VALUES
    (v_owner, p_employee_id, auth.uid(), v_subtotal, v_discount,
     NULLIF(trim(COALESCE(p_discount_reason, '')), ''),
     NULLIF(trim(COALESCE(p_coupon_code, '')), ''),
     NULLIF(trim(COALESCE(p_notes, '')), ''),
     v_total, p_items,
     CASE WHEN v_employee.credit_limit > 0 AND v_new_debt > v_employee.credit_limit
          THEN p_justification ELSE NULL END)
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_entry_id, 'subtotal', v_subtotal,
                            'discount', v_discount, 'total', v_total, 'new_debt', v_new_debt);
END;
$$;
