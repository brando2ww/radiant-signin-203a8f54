-- Orçamento do fornecedor: várias ofertas (marcas) por item.
--
-- Antes o formulário público gravava UMA resposta por (item, fornecedor): um
-- fornecedor que trabalha com 3 marcas de entrecot só conseguia cotar uma delas.
-- Agora cada marca é uma linha própria em pdv_quotation_responses e concorre
-- sozinha no comparativo — o vencedor já era escolhido por resposta (is_winner),
-- então o ranking e o pedido continuam funcionando sem mudança de modelo.
--
-- Nada a remover: nunca houve unique em (quotation_item_id, supplier_id). A
-- regra de "uma resposta só" vivia no código da edge, não no banco.

-- Como o produto é entregue. Perecível varia entre resfriado e congelado com
-- preço e validade bem diferentes; seco não tem essa dimensão, por isso NULL é
-- válido em vez de um valor default mentiroso.
alter table public.pdv_quotation_responses
  add column if not exists conservation text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pdv_quotation_responses'::regclass
      and conname = 'pdv_quotation_responses_conservation_check'
  ) then
    alter table public.pdv_quotation_responses
      add constraint pdv_quotation_responses_conservation_check
      check (conservation is null or conservation in ('resfriado', 'congelado', 'ambiente'));
  end if;
end $$;

comment on column public.pdv_quotation_responses.conservation is
  'Como o produto é entregue: resfriado | congelado | ambiente (seco). NULL = não informado.';

-- O formulário público e o comparativo carregam as ofertas por (item, fornecedor).
create index if not exists pdv_quotation_responses_item_supplier_idx
  on public.pdv_quotation_responses (quotation_item_id, supplier_id);
