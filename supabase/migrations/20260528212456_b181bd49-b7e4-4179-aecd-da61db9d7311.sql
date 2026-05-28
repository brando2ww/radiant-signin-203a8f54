-- 1. Trigger BEFORE INSERT em delivery_orders para atribuir número sequencial
CREATE OR REPLACE FUNCTION public.delivery_orders_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session uuid;
  v_next int;
BEGIN
  -- Só age quando order_number está vazio ou é provisório
  IF NEW.order_number IS NOT NULL AND NEW.order_number NOT LIKE 'TMP-%' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_session
  FROM public.pdv_cashier_sessions
  WHERE user_id = NEW.user_id AND closed_at IS NULL
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_session IS NULL THEN
    -- Sem caixa aberto: mantém o TMP-… (o RPC ou abertura de caixa atribuirá depois)
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(ticket_number), 0) + 1 INTO v_next
  FROM public.delivery_orders
  WHERE cashier_session_id = v_session;

  NEW.cashier_session_id := v_session;
  NEW.ticket_number := v_next;
  NEW.order_number := lpad(v_next::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_orders_assign_number ON public.delivery_orders;
CREATE TRIGGER trg_delivery_orders_assign_number
BEFORE INSERT ON public.delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.delivery_orders_assign_number();

-- 2. Função para atribuir números a pedidos TMP- pendentes quando o caixa abre
CREATE OR REPLACE FUNCTION public.delivery_assign_pending_tickets(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_next int;
  v_count int := 0;
  r record;
BEGIN
  SELECT user_id INTO v_owner
  FROM public.pdv_cashier_sessions
  WHERE id = p_session_id;

  IF v_owner IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(MAX(ticket_number), 0) + 1 INTO v_next
  FROM public.delivery_orders
  WHERE cashier_session_id = p_session_id;

  FOR r IN
    SELECT id
    FROM public.delivery_orders
    WHERE user_id = v_owner
      AND cashier_session_id IS NULL
      AND status <> 'cancelled'
      AND (order_number IS NULL OR order_number LIKE 'TMP-%')
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    UPDATE public.delivery_orders
       SET cashier_session_id = p_session_id,
           ticket_number = v_next,
           order_number = lpad(v_next::text, 3, '0')
     WHERE id = r.id;
    v_next := v_next + 1;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 3. Trigger AFTER INSERT em pdv_cashier_sessions para chamar a função acima
CREATE OR REPLACE FUNCTION public.trg_assign_pending_on_session_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.delivery_assign_pending_tickets(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pdv_cashier_sessions_assign_pending ON public.pdv_cashier_sessions;
CREATE TRIGGER trg_pdv_cashier_sessions_assign_pending
AFTER INSERT ON public.pdv_cashier_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_assign_pending_on_session_open();

-- 4. Corrige retroativamente os pedidos TMP- atuais usando as sessões já abertas
DO $$
DECLARE
  s record;
BEGIN
  FOR s IN SELECT id FROM public.pdv_cashier_sessions WHERE closed_at IS NULL LOOP
    PERFORM public.delivery_assign_pending_tickets(s.id);
  END LOOP;
END $$;