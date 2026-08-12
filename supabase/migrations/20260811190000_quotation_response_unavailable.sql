-- Fornecedor pode responder "não tenho este item" pelo link público.
-- A recusa vira uma resposta como qualquer outra (para o lojista ver quem
-- respondeu o quê), só que sem preço e com o motivo preenchido.
alter table public.pdv_quotation_responses
  add column if not exists unavailable_reason text;

comment on column public.pdv_quotation_responses.unavailable_reason is
  'Quando preenchido, o fornecedor declarou que não pode ofertar o item: sem_estoque | nao_trabalha | em_falta. Linhas assim têm unit_price nulo e NÃO entram no comparativo de preço.';

alter table public.pdv_quotation_responses
  drop constraint if exists pdv_quotation_responses_unavailable_reason_check;

alter table public.pdv_quotation_responses
  add constraint pdv_quotation_responses_unavailable_reason_check
  check (unavailable_reason is null or unavailable_reason in ('sem_estoque', 'nao_trabalha', 'em_falta'));

-- Recusa não tem preço; oferta tem. Impede que uma recusa entre no ranking
-- como R$ 0,00 caso alguma tela esqueça de filtrar.
alter table public.pdv_quotation_responses
  drop constraint if exists pdv_quotation_responses_price_xor_unavailable;

alter table public.pdv_quotation_responses
  add constraint pdv_quotation_responses_price_xor_unavailable
  check (unavailable_reason is null or unit_price is null);
