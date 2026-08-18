-- Cruza nota fiscal de entrada com lançamento financeiro, nos dois sentidos.
--
-- A ligação já existia, mas pela metade: `pdv_invoices.financial_transaction_id`
-- apontava para a PRIMEIRA parcela apenas. Da segunda em diante, o lançamento
-- não sabia de que nota veio, e a nota não sabia quanto ainda faltava pagar.
--
-- Aqui a direção se inverte: cada lançamento aponta para a nota. Uma nota tem
-- muitas parcelas; uma parcela tem uma nota. É a cardinalidade real.

alter table public.pdv_financial_transactions
  add column if not exists invoice_id uuid references public.pdv_invoices(id) on delete set null;

comment on column public.pdv_financial_transactions.invoice_id is
  'Nota fiscal de entrada que originou o lançamento. Todas as parcelas da mesma nota apontam para ela.';

create index if not exists idx_pdv_ft_invoice
  on public.pdv_financial_transactions (invoice_id)
  where invoice_id is not null;

-- Retroativo: as notas já importadas conhecem a primeira parcela. Pelo grupo e
-- pela chave do documento dá para alcançar as demais.
update public.pdv_financial_transactions t
   set invoice_id = i.id
  from public.pdv_invoices i
 where t.invoice_id is null
   and i.financial_transaction_id is not null
   and (
     t.id = i.financial_transaction_id
     or (t.document_number is not null and t.document_number = i.invoice_key and t.user_id = i.user_id)
   );

-- ---------------------------------------------------------------------------
-- Conta contábil padrão por fornecedor
-- ---------------------------------------------------------------------------

-- É o que faz a classificação parar de ser digitada toda vez. Classificou a
-- primeira nota do fornecedor, as próximas já chegam classificadas — e param
-- de cair em "Sem classificação" na DRE.
alter table public.pdv_suppliers
  add column if not exists default_chart_account_id uuid
    references public.pdv_chart_of_accounts(id) on delete set null,
  add column if not exists default_cost_center_id uuid
    references public.pdv_cost_centers(id) on delete set null;

comment on column public.pdv_suppliers.default_chart_account_id is
  'Conta contábil sugerida ao lançar uma nota deste fornecedor. Sugestão, não imposição: a tela deixa trocar.';

-- Semeia a partir do que já foi classificado à mão: a conta mais usada nos
-- lançamentos de cada fornecedor vira o padrão dele.
with mais_usada as (
  select distinct on (t.user_id, t.supplier_id)
         t.user_id, t.supplier_id, t.chart_account_id, count(*) as vezes
    from public.pdv_financial_transactions t
   where t.supplier_id is not null
     and t.chart_account_id is not null
   group by t.user_id, t.supplier_id, t.chart_account_id
   order by t.user_id, t.supplier_id, count(*) desc
)
update public.pdv_suppliers s
   set default_chart_account_id = mais_usada.chart_account_id
  from mais_usada
 where s.id = mais_usada.supplier_id
   and s.user_id = mais_usada.user_id
   and s.default_chart_account_id is null;
