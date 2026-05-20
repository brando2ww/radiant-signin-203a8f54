## Objetivo

Adicionar um atalho **"Despesa"** na sidebar de ações rápidas do Caixa (`/pdv/caixa`), reutilizando o `QuickExpenseDialog` já existente. Esse fluxo permite registrar gastos de mercado, acerto de motoboys, etc. antes de fechar o caixa, e o lançamento flui automaticamente para o Plano de Contas, Fluxo de Caixa e DRE (já é como o hook `use-quick-expense` funciona hoje).

## Mudanças

### 1. `src/components/pdv/cashier/CashierActionsSidebar.tsx`
- Adicionar prop opcional `onQuickExpense?: () => void`.
- No grid 2x2 de ações secundárias (visível quando o caixa está aberto), adicionar um novo botão **"Despesa"** com ícone `Receipt`/`Wallet` (lucide) e cor temática neutra (seguindo o padrão do projeto: tokens default, sem cores extras).
- Reorganizar o grid para acomodar 5 botões: Reforço, Sangria, Cobrar, Despesa, Consumo. Pode-se passar para `grid-cols-2` com 3 linhas, mantendo o botão "Despesa" próximo à Sangria (ambos são saídas de dinheiro).

### 2. `src/pages/pdv/Cashier.tsx`
- Importar `QuickExpenseDialog` de `@/components/pdv/financial/QuickExpenseDialog`.
- Adicionar estado `const [quickExpenseDialog, setQuickExpenseDialog] = useState(false)`.
- Passar `onQuickExpense={() => window.setTimeout(() => setQuickExpenseDialog(true), 0)}` ao `CashierActionsSidebar` (segue o padrão de defer com `setTimeout 0` usado em `onCharge`).
- Renderizar `<QuickExpenseDialog open={quickExpenseDialog} onOpenChange={setQuickExpenseDialog} />` junto com os outros dialogs.

### 3. Sem mudanças de banco / regra de negócio
O `useQuickExpense` já:
- Cria `pdv_financial_transactions` com `status: paid`, `chart_account_id`, `cost_center_id`, `payment_method`, `supplier_id`.
- Faz invalidate de `pdv-financial-transactions` e `pdv-financial-stats`.
- Dá entrada de estoque opcional.

Esses lançamentos já aparecem em Fluxo de Caixa, DRE e Extrato do Caixa por conta da estrutura existente — nada a refatorar no backend.

## Fora de escopo (a confirmar depois se necessário)
- Não vamos vincular a despesa ao `cashier_session_id` ativo nem registrar como "sangria" automática do caixa. Hoje o `QuickExpenseDialog` é puramente financeiro (não mexe no saldo físico do caixa). Se você quiser que ao escolher forma de pagamento "Dinheiro" ele também gere uma sangria automática na sessão de caixa atual, podemos tratar em uma próxima iteração.
