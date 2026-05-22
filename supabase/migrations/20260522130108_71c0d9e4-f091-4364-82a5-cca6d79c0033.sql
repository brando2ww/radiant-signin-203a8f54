-- Limpa jobs duplicados de impressão de delivery (mantém o mais antigo por item+centro)
DELETE FROM public.pdv_print_jobs a
USING public.pdv_print_jobs b
WHERE a.source_kind = 'delivery'
  AND b.source_kind = 'delivery'
  AND a.source_item_id IS NOT NULL
  AND a.source_item_id = b.source_item_id
  AND a.center_id IS NOT DISTINCT FROM b.center_id
  AND a.created_at > b.created_at;

-- Índice único parcial: 1 job por (item, centro) para delivery automático.
-- Reimpressão manual deve passar source_item_id=NULL para escapar deste índice.
CREATE UNIQUE INDEX IF NOT EXISTS pdv_print_jobs_delivery_item_center_uniq
  ON public.pdv_print_jobs (source_item_id, center_id)
  WHERE source_kind = 'delivery' AND source_item_id IS NOT NULL;