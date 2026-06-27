-- Expande o CHECK constraint de transaction_type para aceitar 'payable' e 'receivable'
-- além dos valores originais 'income' e 'expense', resolvendo o mismatch entre
-- o schema do banco e o código TypeScript do módulo financeiro.
ALTER TABLE public.pdv_financial_transactions
  DROP CONSTRAINT IF EXISTS pdv_financial_transactions_transaction_type_check;

ALTER TABLE public.pdv_financial_transactions
  ADD CONSTRAINT pdv_financial_transactions_transaction_type_check
  CHECK (transaction_type IN ('income', 'expense', 'payable', 'receivable'));
