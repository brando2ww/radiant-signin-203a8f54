Havia uma segunda definição de `netCash` no `CloseCashierDialog.tsx` (linha 391) — o componente de fechamento real (`CloseCashierDialogV2`) ainda usa `totalCash - totalChange`, por isso o Saldo Esperado segue R$ 152,80 em vez de R$ 176,40.

### Correção

Em `src/components/pdv/CloseCashierDialog.tsx`, linha 391:

```ts
const netCash = totalCash; // já líquido (valor da venda)
```

Sem outras mudanças — o resto da fórmula (`openingBalance + netCash + totalReinforcements - totalWithdrawals`) já está correto.