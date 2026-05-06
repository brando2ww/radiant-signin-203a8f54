
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS customer_delivery_confirmed_at timestamptz;

-- Trigger que impede que esta política de cliente altere campos sensíveis.
CREATE OR REPLACE FUNCTION public.delivery_guard_customer_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só age quando NÃO há sessão autenticada do restaurante (cliente final).
  -- Quando o usuário do restaurante atualiza, auth.uid() existe e é dono → libera.
  IF auth.uid() IS NOT NULL AND (
       NEW.user_id = auth.uid()
       OR public.is_establishment_member(NEW.user_id)
     ) THEN
    RETURN NEW;
  END IF;

  -- Caso contrário (cliente final via política pública): só pode mudar customer_delivery_confirmed_at.
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.cashier_confirmed_at IS DISTINCT FROM OLD.cashier_confirmed_at
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Cliente só pode confirmar recebimento; alterações restritas';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_guard_customer_confirmation ON public.delivery_orders;
CREATE TRIGGER trg_delivery_guard_customer_confirmation
BEFORE UPDATE ON public.delivery_orders
FOR EACH ROW
EXECUTE FUNCTION public.delivery_guard_customer_confirmation();

-- Política RLS para o cliente final confirmar recebimento via id do pedido.
DROP POLICY IF EXISTS "Customer can confirm delivery received" ON public.delivery_orders;
CREATE POLICY "Customer can confirm delivery received"
ON public.delivery_orders
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);
