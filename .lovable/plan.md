## Mover "Dinheiro contado na gaveta" para a Seção 3

Mover o input **"Dinheiro contado na gaveta"** (e a Card de risco/diferença associada) da Seção 1 para dentro da Seção 3 — Conferência dos valores apurados, como o primeiro item do grid de métodos (antes de Crédito/Débito/PIX), usando o componente `MethodConference`.

### Arquivo afetado
- `src/components/pdv/CloseCashierDialog.tsx`

### Mudanças
- **Seção 1** passa a mostrar apenas o resumo da gaveta (abertura, vendas em dinheiro, reforços, sangrias, saldo esperado). Sem campo de input.
- **Seção 3 (Conferência)** ganha como primeiro card:
  - `MethodConference` rotulado "Dinheiro (gaveta)" com `expected={expectedCash}` e `declared={declaredCash}`
  - A Card de risco/aviso (`cashRiskConfig`) renderizada logo abaixo do grid quando `hasCashDeclared` for verdadeiro
- Estado, hooks, payload e validação permanecem inalterados — apenas reposicionamento de JSX.

### Observação
A diferença de gaveta continua sendo tratada como hoje (mesmo cálculo, mesmo aviso de risco, mesma exigência de justificativa).