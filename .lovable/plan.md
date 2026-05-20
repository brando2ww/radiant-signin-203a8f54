## Mudanças

### 1. `src/components/pdv/cashier/CashierActionsSidebar.tsx`
- Remover botão **Cobrar** (e a prop `onCharge`).
- Remover botão **Consumo Funcionário** (e a prop `onEmployeeConsumption`).
- Grid passa a ter 3 botões secundários: Reforço, Sangria, Despesa. Manter `grid-cols-2` (1 célula vazia ou ajustar layout — proponho deixar `grid-cols-2` com Despesa ocupando a 4ª célula naturalmente, ou usar `grid-cols-3` com altura levemente reduzida). Decisão: `grid-cols-2` mantendo consistência visual.
- Manter atalho F5 livre (não realocar para outra ação agora).

### 2. `src/pages/pdv/Cashier.tsx`
- Remover passagem de `onCharge` e `onEmployeeConsumption` ao `CashierActionsSidebar` (mantém os dialogs/estados existentes caso sejam usados em outros atalhos via teclado; se forem exclusivos do sidebar, removemos junto). A confirmar ao ler o arquivo: se F5 (Cobrar) e o dialog de consumo só são acionados pela sidebar, remover também estado e render.
- Passar `cashierSessionId={activeSession?.id ?? null}` ao `QuickExpenseDialog`.

### 3. `src/components/pdv/financial/QuickExpenseDialog.tsx`
- Nova prop opcional `cashierSessionId?: string | null`.
- Quando `cashierSessionId` está presente (despesa aberta a partir do Caixa):
  - Forçar `payment_method` padrão para `"dinheiro"` (continua editável — outras formas não geram sangria).
  - Exibir alerta informativo: *"Esta despesa será debitada do caixa atual como sangria automática."* quando `payment_method === "dinheiro"`.
- Passar `cashier_session_id` (quando aplicável) para o hook.

### 4. `src/hooks/use-quick-expense.ts`
- Aceitar `cashier_session_id?: string | null` no input.
- Após criar a `pdv_financial_transactions`, se `cashier_session_id` e `payment_method === "dinheiro"`:
  1. Inserir em `pdv_cashier_movements`: `type: "sangria"`, `amount: input.amount`, `description: "Despesa: <descrição>"`, `cashier_session_id`.
  2. Chamar RPC `pdv_recompute_session_totals` para atualizar `total_withdrawals`.
  3. Invalidar `["pdv-cashier-active"]` e `["pdv-cashier-movements"]` no `onSuccess`.
- Defesa: se o valor for maior que `drawerBalance` atual, retornar erro claro (mesma mensagem usada em `addMovement` no `use-pdv-cashier`). Como o hook não tem acesso direto ao saldo, a validação fica em camada mínima (apenas log) e confia no RLS/regra de UI — alternativamente buscar saldo via select rápido antes de inserir. Proponho fazer o select de `opening_balance + total_cash + reforços − total_withdrawals` antes da sangria e bloquear se exceder.

## Fora de escopo
- Não alterar o comportamento do `QuickExpenseDialog` quando aberto fora do Caixa (ex.: dashboard financeiro) — ele continua sendo apenas lançamento financeiro.
- Não mexer em DRE / Plano de Contas / Fluxo de Caixa — a transação financeira já fluía pra lá; agora ganha também o vínculo de sangria no caixa.
- "Cobrar" e "Consumo Funcionário" continuam acessíveis pelos seus pontos de entrada normais (não na sidebar do Caixa).
