-- Vincula o prêmio de fidelidade a um produto real do cardápio.
--
-- Hoje o prêmio é só um nome ("Combo 8 Hot") e um custo em pontos. Na hora do
-- resgate ninguém sabe, pelo sistema, qual produto entregar: o operador deduz
-- pelo nome. Com o vínculo, o resgate passa a poder virar item de pedido — a
-- R$ 0,00 — em vez de um código que alguém honra na mão.
--
-- Aponta para delivery_products (e não pdv_products) porque é a tabela que o
-- carrinho do cardápio público conhece. A ligação com o PDV, e portanto com a
-- ficha técnica e a baixa de estoque, já existe em
-- delivery_products.source_pdv_product_id.
alter table public.delivery_loyalty_prizes
  add column if not exists delivery_product_id uuid
  references public.delivery_products(id) on delete set null;

comment on column public.delivery_loyalty_prizes.delivery_product_id is
  'Produto entregue no resgate. Nulo = prêmio sem produto vinculado (o resgate continua sendo honrado manualmente).';

create index if not exists idx_loyalty_prizes_product
  on public.delivery_loyalty_prizes (delivery_product_id)
  where delivery_product_id is not null;
