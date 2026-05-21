INSERT INTO public.pdv_cashier_movements (cashier_session_id, type, payment_method, amount, description, source, created_at)
VALUES ('97d96849-4e53-48c6-b224-c8b066e4b48b', 'venda', 'fiado', 10.00, 'Venda a prazo (backfill)', 'salon', '2026-05-21 15:45:24+00');

SELECT public.pdv_recompute_session_totals('97d96849-4e53-48c6-b224-c8b066e4b48b');