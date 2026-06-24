-- Adiciona campo de data de competência aos lançamentos financeiros PDV
-- O regime de competência reconhece a obrigação quando ela é gerada,
-- independente da data de pagamento.
ALTER TABLE public.pdv_financial_transactions
  ADD COLUMN IF NOT EXISTS competence_date DATE;

-- Retroativo: usar due_date como competence_date para registros existentes
UPDATE public.pdv_financial_transactions
  SET competence_date = due_date
  WHERE competence_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_pdv_financial_transactions_competence_date
  ON public.pdv_financial_transactions(user_id, competence_date);
