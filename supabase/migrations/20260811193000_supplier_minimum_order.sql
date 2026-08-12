-- Pedido mínimo do fornecedor: abaixo desse valor ele não entrega.
-- Três estados, de propósito:
--   null = ninguém respondeu ainda (os cadastros antigos) — o formulário cobra
--   0    = respondeu "não tem pedido mínimo"
--   > 0  = valor mínimo do pedido
alter table public.pdv_suppliers
  add column if not exists minimum_order numeric;

comment on column public.pdv_suppliers.minimum_order is
  'Valor mínimo de pedido aceito pelo fornecedor. 0 = não tem mínimo. null = ainda não informado (cadastros anteriores ao campo).';

alter table public.pdv_suppliers
  drop constraint if exists pdv_suppliers_minimum_order_positive;

alter table public.pdv_suppliers
  add constraint pdv_suppliers_minimum_order_positive
  check (minimum_order is null or minimum_order >= 0);
