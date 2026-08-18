-- Reprocessamento financeiro: normaliza o que a DRE não conseguia enxergar.
--
-- O mapeamento dos lançamentos apontou quatro problemas de DADO (os de leitura
-- vão no código). Todos afetam meses já fechados, e a decisão foi reprocessar
-- em vez de corrigir só daqui para a frente.
--
--  1. Dois vocabulários para a mesma coisa em transaction_type: a tela de
--     lançamentos grava 'payable'/'receivable', a despesa rápida grava
--     'expense'/'income'. A DRE lê só o primeiro par, então a despesa rápida
--     nunca aparecia no resultado.
--
--  2. competence_date nasce nula em quem insere direto na tabela, e a DRE
--     filtra por ela. Lançamento sem competência é lançamento invisível.
--
--  3. O pagamento de comanda nunca gravou `source` no movimento de caixa.
--     Salão funcionava por acaso (nulo cai no padrão) e balcão ia junto, sem
--     como separar depois.
--
--  4. Faltava onde guardar a escolha entre tratar compra como estoque ou como
--     despesa direta.
--
-- Os gatilhos existem para que o reprocessamento não precise ser repetido:
-- normalizam na escrita, venha de onde vier.

-- ---------------------------------------------------------------------------
-- 1. A coluna de competência, que nunca chegou a existir aqui
-- ---------------------------------------------------------------------------

-- Havia uma migration criando esta coluna (20260618000001), mas ela nunca foi
-- aplicada neste banco. A DRE filtra a despesa por competence_date; o
-- PostgREST devolvia "column does not exist", o código ignorava o erro e a
-- linha DESPESAS OPERACIONAIS aparecia zerada — em silêncio.
--
-- Pior: createTransaction sempre envia competence_date (com fallback para o
-- vencimento), então TODO lançamento criado pela tela "Novo Lançamento"
-- falhava na inserção.
alter table public.pdv_financial_transactions
  add column if not exists competence_date date;

comment on column public.pdv_financial_transactions.competence_date is
  'Mês a que o lançamento pertence no regime de competência. Nulo é preenchido pelo gatilho com pagamento ou vencimento.';

create index if not exists idx_pdv_financial_transactions_competence_date
  on public.pdv_financial_transactions (user_id, competence_date);

-- ---------------------------------------------------------------------------
-- 2. Um vocabulário só para transaction_type
-- ---------------------------------------------------------------------------

-- A restrição em produção ainda é a original, que aceita só 'income' e
-- 'expense'. Havia uma migration ampliando-a (20260627000001) que, como a da
-- competência, nunca foi aplicada aqui. Efeito combinado: a tela "Novo
-- Lançamento" grava 'payable' e batia na restrição, enquanto a Despesa Rápida
-- grava 'expense' e passava. O módulo financeiro nunca conseguiu registrar
-- um lançamento por este banco.
alter table public.pdv_financial_transactions
  drop constraint if exists pdv_financial_transactions_transaction_type_check;

update public.pdv_financial_transactions
   set transaction_type = case transaction_type
         when 'expense' then 'payable'
         when 'income'  then 'receivable'
         else transaction_type
       end
 where transaction_type in ('expense', 'income');

create or replace function public.pdv_normalize_financial_transaction()
returns trigger
language plpgsql
as $$
begin
  -- 'expense'/'income' eram o vocabulário original do banco; o módulo
  -- financeiro adotou 'payable'/'receivable' e o CHECK passou a aceitar os
  -- quatro. Aceitar quatro nomes para dois conceitos é o que fez a despesa
  -- rápida sumir do resultado.
  if new.transaction_type = 'expense' then
    new.transaction_type := 'payable';
  elsif new.transaction_type = 'income' then
    new.transaction_type := 'receivable';
  end if;

  -- Sem competência, o lançamento não entra em nenhum mês. O pagamento é a
  -- melhor aproximação quando existe; senão, o vencimento.
  if new.competence_date is null then
    new.competence_date := coalesce(new.payment_date, new.due_date);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_financial_transaction on public.pdv_financial_transactions;
create trigger trg_normalize_financial_transaction
  before insert or update on public.pdv_financial_transactions
  for each row execute function public.pdv_normalize_financial_transaction();

-- Agora sim, um vocabulário só. A restrição é avaliada depois do gatilho, então
-- código antigo que ainda mande 'expense' continua funcionando — normalizado.
alter table public.pdv_financial_transactions
  add constraint pdv_financial_transactions_transaction_type_check
  check (transaction_type in ('payable', 'receivable'));

update public.pdv_financial_transactions
   set competence_date = coalesce(payment_date, due_date)
 where competence_date is null
   and coalesce(payment_date, due_date) is not null;

-- ---------------------------------------------------------------------------
-- 3. Canal retroativo nos movimentos de caixa
-- ---------------------------------------------------------------------------

-- Salão x balcão sai de onde o pedido nasceu: mesa preenchida (ou origem
-- declarada como salão) é salão; o resto é balcão. Só mexe em movimento de
-- venda com canal nulo — delivery e quitação já vêm marcados.
with origem as (
  select m.id,
         case
           when o.table_id is not null
             or lower(coalesce(o.source, '')) in ('salao', 'salão', 'mesa', 'salon')
           then 'salon'
           else 'counter'
         end as canal
    from public.pdv_cashier_movements m
    join public.pdv_comandas c on c.id = m.comanda_id
    join public.pdv_orders   o on o.id = c.order_id
   where m.source is null
     and m.type = 'venda'
     and m.comanda_id is not null
)
update public.pdv_cashier_movements m
   set source = origem.canal
  from origem
 where m.id = origem.id;

-- Movimento de venda sem comanda e sem canal: não dá para saber a origem, e
-- chutar seria pior. Fica como salão explícito, que é o que a leitura já
-- assumia — a diferença é que agora está escrito, e não implícito.
update public.pdv_cashier_movements
   set source = 'salon'
 where source is null
   and type = 'venda';

create index if not exists idx_cashier_movements_source
  on public.pdv_cashier_movements (cashier_session_id, type, source);

-- ---------------------------------------------------------------------------
-- 4. Como a compra entra no resultado
-- ---------------------------------------------------------------------------

alter table public.pdv_financial_settings
  add column if not exists purchase_costing_mode text not null default 'stock';

alter table public.pdv_financial_settings
  drop constraint if exists pdv_financial_settings_purchase_costing_mode_check;
alter table public.pdv_financial_settings
  add constraint pdv_financial_settings_purchase_costing_mode_check
  check (purchase_costing_mode in ('stock', 'direct_expense'));

comment on column public.pdv_financial_settings.purchase_costing_mode is
  'stock = compra vira estoque e só entra no resultado como CMV quando consumida (exige baixa de estoque confiável). direct_expense = compra entra como custo no mês em que foi recebida.';

-- O regime que a DRE usa por padrão. A tela continua podendo alternar.
alter table public.pdv_financial_settings
  alter column default_accounting_regime set default 'accrual';
