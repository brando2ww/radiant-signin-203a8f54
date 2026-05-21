ALTER TABLE public.pdv_cashier_movements
  DROP CONSTRAINT IF EXISTS pdv_cashier_movements_payment_method_check;

ALTER TABLE public.pdv_cashier_movements
  ADD CONSTRAINT pdv_cashier_movements_payment_method_check
  CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY[
    'dinheiro'::text,
    'credito'::text,
    'debito'::text,
    'cartao'::text,
    'pix'::text,
    'vale_refeicao'::text,
    'fiado'::text
  ]));