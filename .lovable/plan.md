## Problema

No `PaymentDialog` do PDV, o usuário aplicou 30% de desconto, mas o sistema exibe e calcula 28%.

Na imagem: Subtotal R$ 229,00 / Desconto -R$ 64,12 / Total R$ 164,88. Note que 64,12 = 30% de R$ 213,73 (não de R$ 229,00). Ou seja, o desconto **foi calculado corretamente como 30% no momento em que foi aplicado**, mas o subtotal mudou depois (provavelmente entrou um item novo ou um subproduto da ficha técnica passou a contar), e o valor do desconto ficou **congelado** em R$ 64,12.

### Causa raiz

Em `src/components/pdv/cashier/PaymentDialog.tsx`:

- Linha 347: `const discountAmount = appliedDiscount?.amount ?? 0;`
- Linha 1588-1595: `setAppliedDiscount({ amount: amt, percent: pct, ... })` grava `amount` calculado no instante do clique em "Confirmar".

Quando o subtotal muda após o desconto estar aplicado, `appliedDiscount.amount` continua o mesmo. Resultado: para desconto em %, a porcentagem efetiva cai (30% → 28%), e o cliente vê valores incoerentes.

## Solução

Tornar o desconto em **percentual** reativo ao subtotal atual, mantendo o desconto em **valor fixo** congelado (comportamento esperado para R$).

### Mudanças em `src/components/pdv/cashier/PaymentDialog.tsx`

1. **Derivar `discountAmount` e `discountPercent` a partir do tipo aplicado**, em vez de ler diretamente `appliedDiscount.amount`:

   ```ts
   const discountAmount = (() => {
     if (!appliedDiscount) return 0;
     if (appliedDiscount.type === "percent") {
       const v = parseFloat(appliedDiscount.rawValue) || 0;
       const amt = (subtotal * v) / 100;
       return Math.min(subtotal, Math.max(0, amt));
     }
     // valor fixo: nunca exceder o subtotal atual
     return Math.min(subtotal, appliedDiscount.amount);
   })();
   ```

2. **Atualizar a exibição "Desconto aplicado"** (linha 1244-1248) para usar o `discountAmount` recalculado e, no caso de %, mostrar sempre `rawValue%` (já é o comportamento atual, só precisa do amount certo).

3. **Atualizar o snapshot de pagamento** (linhas 684-686, 851, 894) para enviar o `discountAmount` recalculado em vez de `appliedDiscount.amount`. Isso garante que o backend grave o valor real cobrado, não o congelado.

4. **Aviso visual** (opcional, mas recomendado): quando `appliedDiscount.type === "value"` e `appliedDiscount.amount > subtotal`, mostrar texto pequeno em laranja indicando que o desconto foi limitado ao subtotal.

### Fora de escopo

- Não alterar lógica de autorização, cupons, fees ou regras de fechamento.
- Não mexer em ComandaDetailsDialog nem em outras telas.
- Manter o fluxo de "Confirmar/Remover" inalterado.

## Validação

- Aplicar 30% com subtotal R$ 213,73 → exibe "-R$ 64,12 (30%)".
- Adicionar item de R$ 15,27, subtotal vai a R$ 229,00 → exibe "-R$ 68,70 (30%)", total R$ 160,30.
- Remover item, subtotal volta a R$ 213,73 → exibe "-R$ 64,12 (30%)".
- Desconto em R$ 50 com subtotal R$ 229 → continua R$ 50, mesmo se itens mudarem (até o subtotal cair abaixo de 50, aí limita).
