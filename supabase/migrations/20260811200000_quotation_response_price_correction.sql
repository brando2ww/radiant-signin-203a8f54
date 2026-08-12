-- Correção de preço pelo comprador (ex.: fornecedor cotou por tonelada num item
-- em kg). O preço passa a valer para o comparativo e para o pedido, mas o número
-- que o fornecedor mandou não se perde: se ele cobrar o dele depois, é preciso
-- saber de onde veio o nosso.
alter table public.pdv_quotation_responses
  add column if not exists original_unit_price numeric;

alter table public.pdv_quotation_responses
  add column if not exists corrected_at timestamptz;

comment on column public.pdv_quotation_responses.original_unit_price is
  'Preço unitário exatamente como o fornecedor enviou, preservado quando o comprador corrige unit_price. null = nunca foi corrigido.';
