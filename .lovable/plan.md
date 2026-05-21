## Diagnóstico

A venda a prazo registra corretamente em `pdv_employee_consumption_entries` e em `pdv_payments`, mas **não** entra em `pdv_cashier_movements` (por isso não aparece em "Vendas por forma de pagamento" nem em `total_fiado` da sessão).

**Causa:** o hook `registerCreditSale` (`src/hooks/use-employee-consumption.ts`) insere o movimento com `source: "credit_sale"`, mas a tabela `pdv_cashier_movements` tem um CHECK constraint que só aceita `'salon' | 'counter' | 'delivery' | 'delivery_online' | 'quitacao_consumo'`. O insert é rejeitado silenciosamente (a chamada não usa `.throwOnError()`), então o toast "Venda lançada a prazo" aparece mesmo sem o movimento ter sido criado, e o `total_fiado` permanece zerado.

## Correções

1. **`src/hooks/use-employee-consumption.ts`** (linha ~221): trocar `source: "credit_sale"` por `source: "salon"` para passar no CHECK constraint da tabela. Como a venda a prazo de comanda nasce do salão, esse valor é coerente.

2. **Migração SQL — backfill da venda a prazo já feita hoje (R$ 10,00):**
   - Inserir um `pdv_cashier_movements` correspondente ao `pdv_employee_consumption_entries` `892deda9-…` (sessão `97d96849-…`).
   - Rodar `pdv_recompute_session_totals` para a sessão aberta, atualizando `total_fiado` e `total_sales`.
   - (A venda a prazo de R$ 20,00 das 14:52 foi feita ANTES de a sessão atual abrir às 15:44, então não pertence a esta sessão e não será backfillada.)

Sem mudanças de UI; apenas hook + migração.