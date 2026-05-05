## Correção: remover "Troco entregue" do Fechar Caixa

A linha "(−) Troco entregue" está duplicando o desconto do troco no modal de Fechamento (e no recibo impresso). O `total_cash` já é gravado líquido (valor da venda), então subtrair `total_change` novamente quebra o Saldo Esperado.

O bloco do rodapé do caixa (`CashierSummaryFooter.tsx`) e a tela `Cashier.tsx` já estão corretos — usam `netCash = totalCash` sem subtrair troco. A correção é só no `CloseCashierDialog.tsx`.

### Mudanças em `src/components/pdv/CloseCashierDialog.tsx`

1. **Cálculo (linhas 130, 142–143)**: remover `totalChange` e usar
   ```
   netCash = totalCash
   expectedCash = openingBal + totalCash + totalReinforcements - totalWithdrawals
   ```
   Manter a variável `totalChange` apenas se ainda for usada em outro lugar (é usada apenas na linha removida — pode ser removida).

2. **UI do modal (linhas 528–535)**: remover o bloco da linha "(−) Troco entregue". Renomear "Vendas em dinheiro" → manter como está; rótulos finais:
   - Abertura
   - Vendas em dinheiro (+)
   - Reforços (+)
   - Sangrias (−)
   - Saldo Esperado da Gaveta

3. **Recibo impresso (linha 219)**: remover a linha `<div class="row"><span>(−) Troco entregue:</span>...`. Atualizar "Dinheiro recebido" → "Vendas em dinheiro" para consistência.

### Validação
Com Abertura R$ 50,00 + Vendas R$ 126,40 + 0 reforço − 0 sangria = **R$ 176,40**, batendo com Saldo Atual da Gaveta e header.

Sem mudanças em banco, hook ou outros componentes.