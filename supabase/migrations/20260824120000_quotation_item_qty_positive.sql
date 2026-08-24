-- Item de cotação com quantidade zero não é cotação.
--
-- O fornecedor recebe "Produto X: 0 un" e não tem o que orçar; depois esse item
-- entra no comparativo sem vencedor possível e trava o fechamento do pedido.
--
-- Passava porque o `min` do input é só dica do navegador e o `parseFloat(...) ||
-- 0` da tela transforma campo vazio em zero. A tela agora barra, mas a regra
-- pertence ao banco: é a única barreira que vale para qualquer caminho de
-- escrita, hoje e depois.
--
-- NOT VALID de propósito: vale para todo INSERT e UPDATE a partir de agora, sem
-- exigir que cotações antigas com zero sejam corrigidas antes. Elas continuam
-- legíveis; só não podem ser regravadas assim.

alter table public.pdv_quotation_items
  drop constraint if exists pdv_quotation_items_quantidade_positiva;

alter table public.pdv_quotation_items
  add constraint pdv_quotation_items_quantidade_positiva
  check (quantity_needed > 0) not valid;

comment on constraint pdv_quotation_items_quantidade_positiva on public.pdv_quotation_items is
  'Quantidade precisa ser maior que zero — sem ela o fornecedor não tem o que orçar.';
