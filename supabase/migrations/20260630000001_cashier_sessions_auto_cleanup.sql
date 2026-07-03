-- Deleta sessões FECHADAS com mais de 60 dias (movimentações apagadas via CASCADE).
-- Sessões ainda abertas (closed_at IS NULL) não são afetadas.
CREATE OR REPLACE FUNCTION pdv_cleanup_old_cashier_sessions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM public.pdv_cashier_sessions
  WHERE closed_at IS NOT NULL
    AND closed_at < NOW() - INTERVAL '60 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Agendar execução diária às 03:00 UTC (meia-noite BRT)
SELECT cron.schedule(
  'velara-cashier-cleanup-60d',
  '0 3 * * *',
  'SELECT pdv_cleanup_old_cashier_sessions()'
);
