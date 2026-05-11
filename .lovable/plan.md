## Objetivo

Permitir lançar rapidamente em **Financeiro › Lançamentos** qualquer saída de caixa (extras, mercados, manutenção, etc.) **já marcada como paga** e **com plano de contas obrigatório**. Quando for compra de insumos, opcionalmente dar entrada no estoque na mesma operação.

## Fluxo na tela

Na página `/pdv/financeiro/lancamentos` adicionar um botão secundário **"Despesa rápida"** ao lado de "Novo Lançamento". Ele abre um diálogo enxuto, focado em saída paga.

### Diálogo "Despesa rápida"

Campos:
- **Descrição** (obrigatória) — ex: "Mercado Atacadão", "Conserto freezer".
- **Valor total** (obrigatório, `CurrencyInput`).
- **Data do pagamento** (default hoje).
- **Plano de contas** (obrigatório, `Select` filtrado por tipo de despesa).
- **Centro de custo** (opcional).
- **Forma de pagamento** (opcional: dinheiro, pix, cartão, transferência, boleto).
- **Fornecedor** (opcional, autocomplete).
- **Nº do documento** (opcional, cupom/NF).
- **Observações** (opcional).
- Toggle **"Dar entrada no estoque"** (off por default).

Quando o toggle é ligado, expande uma sub-seção **"Itens da compra"**:
- Tabela com linhas: ingrediente (autocomplete em `pdv_ingredients`), quantidade, unidade (preenchida automaticamente), custo unitário, subtotal.
- Botão "+ adicionar item".
- Rodapé mostra **soma dos itens** vs **valor total da despesa**, com aviso em texto se houver diferença (não bloqueia — diferença pode ser frete/imposto).

Ao salvar:
1. Cria registro em `pdv_financial_transactions` com `transaction_type='payable'`, `status='paid'`, `payment_date` preenchida, `chart_account_id`, demais campos.
2. Se o toggle estiver ligado, para cada item:
   - Insere `pdv_stock_movements` com `type='entrada'`, `reason='Compra - <descrição>'`, `created_by=user.id`.
   - Atualiza `current_stock` e `last_entry_date` do ingrediente.
   - (Opcional) atualiza `cost_price` do ingrediente com o último custo unitário informado.
3. Não mexe no caixa operacional (`pdv_cashier_movements`) — confirmado pelo usuário.

## Validações

- Plano de contas obrigatório (zod schema).
- Pelo menos 1 caractere em descrição e valor > 0.
- Se toggle ligado: pelo menos 1 item com quantidade > 0 e custo > 0.

## Arquivos

Novos:
- `src/components/pdv/financial/QuickExpenseDialog.tsx` — diálogo principal.
- `src/components/pdv/financial/QuickExpenseStockItems.tsx` — sub-seção de itens.
- `src/hooks/use-quick-expense.ts` — mutation que cria a transação e (opcional) os movimentos de estoque numa só operação.

Editados:
- `src/pages/pdv/financial/FinancialTransactions.tsx` — botão "Despesa rápida" + estado do diálogo.
- (Reaproveita) `usePDVChartOfAccounts`, `usePDVCostCenters`, `usePDVSuppliers`, `usePDVIngredients`.

## Detalhes técnicos

- Sem migração de schema — `pdv_financial_transactions`, `pdv_stock_movements` e enums já cobrem o caso.
- Mutation usa duas chamadas sequenciais (insert transaction → insert movements + update ingredients). Em caso de falha do estoque, registra a transação mesmo assim e exibe toast de aviso.
- Após sucesso: invalida `pdv-financial-transactions`, `pdv-ingredients`, `pdv-stock-movements`.
- Selects seguem regra Radix: valor interno `'none'` para opcionais vazios.
- Tudo em pt-BR, formatação BRL via `formatBRL`.
