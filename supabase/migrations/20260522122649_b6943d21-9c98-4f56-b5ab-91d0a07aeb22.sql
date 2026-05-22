UPDATE public.pdv_comandas
SET status = 'cancelada',
    cancelled_at = now(),
    cancellation_reason = 'Comanda órfã (order pai já fechada) — limpeza manual para destravar fechamento de caixa',
    cancellation_category = 'orfan_cleanup',
    updated_at = now()
WHERE id IN (
  '5e2938ca-b7f3-4d36-93f1-923859703db7',
  '3d296ce5-0fd8-484a-936b-5b0f60930620',
  '1b4bbed3-9a5d-47a5-8c27-2bdc3ab40f95'
);