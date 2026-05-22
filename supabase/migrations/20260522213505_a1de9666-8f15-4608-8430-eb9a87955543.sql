-- Fecha sessões de caixa duplicadas, mantendo apenas a mais recente aberta por usuário
WITH ranked AS (
  SELECT id,
         user_id,
         opened_at,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY opened_at DESC) AS rn
    FROM public.pdv_cashier_sessions
   WHERE closed_at IS NULL
)
UPDATE public.pdv_cashier_sessions s
   SET closed_at = now(),
       closing_balance = COALESCE(s.opening_balance, 0)
                          + COALESCE(s.total_cash, 0)
                          - COALESCE(s.total_withdrawals, 0),
       notes = COALESCE(s.notes, '') ||
               CASE WHEN COALESCE(s.notes, '') = '' THEN '' ELSE E'\n' END ||
               '[Sessão duplicada encerrada automaticamente]'
  FROM ranked r
 WHERE s.id = r.id
   AND r.rn > 1;