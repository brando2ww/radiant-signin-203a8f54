
-- 1) Trigger: impede marcar como completed sem pagamento confirmado para pagamento offline
CREATE OR REPLACE FUNCTION public.delivery_block_unpaid_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND COALESCE(OLD.status, '') <> 'completed'
     AND COALESCE(NEW.payment_method, '') IN ('cash','dinheiro','credit','credito','debit','debito')
     AND COALESCE(NEW.payment_status, '') <> 'paid'
     AND NEW.cashier_confirmed_at IS NULL
  THEN
    RAISE EXCEPTION 'Pedido com pagamento na entrega só pode ser concluído após registro no caixa';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_block_unpaid_completion ON public.delivery_orders;
CREATE TRIGGER trg_delivery_block_unpaid_completion
BEFORE UPDATE ON public.delivery_orders
FOR EACH ROW
EXECUTE FUNCTION public.delivery_block_unpaid_completion();

-- 2) Configuração do limiar de alerta
ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS payment_overdue_minutes integer NOT NULL DEFAULT 30;
