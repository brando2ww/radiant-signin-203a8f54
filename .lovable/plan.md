## Problema

No `PaymentDialog`, o conteúdo está sendo cortado em duas situações:
1. A coluna direita do resumo do pedido corta valores (ex.: "R$ 59,00" aparece como "R").
2. O `border`/focus ring de inputs encostados na borda esquerda dos painéis de scroll fica cortado pelo container `overflow-y-auto pr-1` (não tem padding à esquerda).

## Solução (apenas `src/components/pdv/cashier/PaymentDialog.tsx`)

1. Trocar a largura máxima do `DialogContent` principal (linha 1189) de `sm:max-w-3xl` para `sm:max-w-5xl`, dando ~256px a mais para acomodar as duas colunas sem corte.
2. Trocar `pr-1` por `px-1` nos dois containers `overflow-y-auto` (linhas 1206 e 1795) para que o focus ring/border dos inputs nas extremidades não seja clipado.

### Fora do escopo

- Sem mudanças no `DialogContent` de sucesso (`sm:max-w-md` na linha 1052) — ele é mais simples e não tem o problema.
- Sem mudanças nos dialogs aninhados (cupom, cartão, cancelar).

### Arquivos

- `src/components/pdv/cashier/PaymentDialog.tsx`
