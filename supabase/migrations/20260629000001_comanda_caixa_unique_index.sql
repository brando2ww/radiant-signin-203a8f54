-- Limpa jobs duplicados de comanda_caixa (mantém o mais antigo por pedido+centro)
DELETE FROM public.pdv_print_jobs a
USING public.pdv_print_jobs b
WHERE a.source_kind = 'comanda_caixa'
  AND b.source_kind = 'comanda_caixa'
  AND a.source_item_id IS NOT NULL
  AND a.source_item_id = b.source_item_id
  AND a.center_id IS NOT DISTINCT FROM b.center_id
  AND a.created_at > b.created_at;

-- Índice único parcial: 1 job por (pedido, centro) para comanda_caixa automática.
-- Reimpressão manual deve passar source_item_id=NULL para escapar deste índice.
CREATE UNIQUE INDEX IF NOT EXISTS pdv_print_jobs_comanda_caixa_order_center_uniq
  ON public.pdv_print_jobs (source_item_id, center_id)
  WHERE source_kind = 'comanda_caixa' AND source_item_id IS NOT NULL;
