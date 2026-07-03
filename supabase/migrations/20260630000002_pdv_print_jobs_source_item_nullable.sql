-- Permite source_item_id NULL para reimpressões manuais.
-- O índice único parcial já filtra com WHERE source_item_id IS NOT NULL,
-- então NULLs escapam do dedup e permitem múltiplas reimpressões do mesmo pedido.
ALTER TABLE public.pdv_print_jobs
  ALTER COLUMN source_item_id DROP NOT NULL;
