CREATE OR REPLACE FUNCTION public.pdv_auto_close_order_on_comanda_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_count INTEGER;
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('cancelada','fechada') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.pdv_comandas
  WHERE order_id = NEW.order_id
    AND status IN ('aberta','aguardando_pagamento','em_cobranca');

  IF v_open_count = 0 THEN
    UPDATE public.pdv_orders
       SET status = 'fechado',
           closed_at = COALESCE(closed_at, now()),
           updated_at = now()
     WHERE id = NEW.order_id
       AND status IN ('aberta','aberto');

    UPDATE public.pdv_tables
       SET current_order_id = NULL,
           status = 'livre',
           updated_at = now()
     WHERE current_order_id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pdv_comandas_auto_close_order ON public.pdv_comandas;
CREATE TRIGGER pdv_comandas_auto_close_order
AFTER UPDATE OF status ON public.pdv_comandas
FOR EACH ROW
EXECUTE FUNCTION public.pdv_auto_close_order_on_comanda_terminal();

-- One-shot cleanup: pedidos com todas as comandas terminais mas ainda abertos
WITH stuck_orders AS (
  SELECT o.id
  FROM public.pdv_orders o
  WHERE o.status IN ('aberta','aberto')
    AND EXISTS (SELECT 1 FROM public.pdv_comandas c WHERE c.order_id = o.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.pdv_comandas c
      WHERE c.order_id = o.id
        AND c.status IN ('aberta','aguardando_pagamento','em_cobranca')
    )
)
UPDATE public.pdv_orders o
   SET status = 'fechado',
       closed_at = COALESCE(o.closed_at, now()),
       updated_at = now()
  FROM stuck_orders s
 WHERE o.id = s.id;

UPDATE public.pdv_tables t
   SET current_order_id = NULL,
       status = 'livre',
       updated_at = now()
 WHERE t.current_order_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.pdv_orders o
     WHERE o.id = t.current_order_id
       AND o.status NOT IN ('aberta','aberto')
   );