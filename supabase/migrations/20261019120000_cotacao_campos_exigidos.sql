-- Cotação: o comprador marca, por produto, o que o fornecedor é OBRIGADO a
-- informar além de marca e preço (pedido do La Vecchia, 19/10/2026).
--
-- Ex.: no coxão mole a validade importa; no frango, o tamanho da caixa. Vale
-- só para os produtos marcados: os outros continuam com os extras opcionais.
--
-- "validade" usa a coluna que já existia (expiration_date). "tamanho" é nova:
-- tamanho da peça, da caixa ou da embalagem, em texto livre ("caixa 18 kg",
-- "peça de 3 a 4 kg"), porque cada produto mede de um jeito.

alter table public.pdv_quotation_items
  add column if not exists required_fields text[] not null default '{}';

alter table public.pdv_quotation_items
  drop constraint if exists pdv_quotation_items_required_fields_check;
alter table public.pdv_quotation_items
  add constraint pdv_quotation_items_required_fields_check
  check (required_fields <@ array['validade', 'tamanho']::text[]);

alter table public.pdv_quotation_responses
  add column if not exists package_size text;
