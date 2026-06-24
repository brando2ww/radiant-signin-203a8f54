-- Remove duplicate pdv_payments entries (keep oldest per order+method)
DELETE FROM public.pdv_payments
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY order_id, payment_method ORDER BY created_at ASC) AS rn
    FROM public.pdv_payments
  ) sub
  WHERE rn > 1
);

-- Prevent same payment method from appearing twice on the same order
ALTER TABLE public.pdv_payments
  ADD CONSTRAINT pdv_payments_order_method_unique UNIQUE (order_id, payment_method);
