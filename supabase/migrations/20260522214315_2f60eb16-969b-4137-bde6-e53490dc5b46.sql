-- 1) Vincular comanda à sessão de caixa
ALTER TABLE public.pdv_comandas
  ADD COLUMN IF NOT EXISTS cashier_session_id uuid REFERENCES public.pdv_cashier_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pdv_comandas_cashier_session
  ON public.pdv_comandas(cashier_session_id);

-- Índice único parcial: número exclusivo dentro da sessão de caixa
CREATE UNIQUE INDEX IF NOT EXISTS idx_pdv_comandas_session_number_unique
  ON public.pdv_comandas(cashier_session_id, comanda_number)
  WHERE cashier_session_id IS NOT NULL;

-- 2) Função atômica de numeração por sessão
CREATE OR REPLACE FUNCTION public.pdv_next_comanda_number(p_owner uuid)
RETURNS TABLE(comanda_number text, cashier_session_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session uuid;
  v_next int;
BEGIN
  IF p_owner IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento não informado';
  END IF;

  -- Lock na sessão ativa para serializar a numeração
  SELECT id INTO v_session
    FROM public.pdv_cashier_sessions
   WHERE user_id = p_owner AND closed_at IS NULL
   ORDER BY opened_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Caixa fechado: abra o caixa antes de criar comandas';
  END IF;

  -- Próximo número considerando apenas comandas desta sessão
  SELECT COALESCE(MAX(
           CASE WHEN c.comanda_number ~ '^[0-9]+$'
                THEN c.comanda_number::int
                ELSE 0
           END
         ), 0) + 1
    INTO v_next
    FROM public.pdv_comandas c
   WHERE c.cashier_session_id = v_session;

  RETURN QUERY SELECT lpad(v_next::text, 3, '0'), v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pdv_next_comanda_number(uuid) TO anon, authenticated;