## Problema
No `PaymentDialog`, no modo "Tudo" e "Várias formas", o subtotal/total exibido (`fullSubtotal`) usa `comanda.subtotal` (ou soma dos itens brutos), ignorando as quantidades já pagas parcialmente (`paid_quantity`). Resultado: comanda de 5×R$10 com 1 item já pago aparece como R$50 em vez dos R$40 que faltam.

O modo "Por produto" já está correto porque usa `selectedSubtotal` calculado a partir dos itens selecionados.

## Alteração
**`src/components/pdv/cashier/PaymentDialog.tsx`** (linhas ~298-314)

Substituir a variável `subtotal` para que, fora do modo by-product, use o **valor pendente real** (já calculado em `pendingSubtotal`) sempre que tivermos itens vivos com `paid_quantity`. Manter o fallback atual apenas quando não há itens vivos (ex.: balcão sem comanda persistida ou mesa sem itens carregados).

```ts
// Subtotal efetivo do "Tudo" / "Várias formas":
// usa o pendente (descontando já-pagos) quando temos itens reais.
const allSubtotal = liveItemsForPayment.length > 0 ? pendingSubtotal : fullSubtotal;

// Subtotal efetivo usado para descontos/taxas/total
const subtotal = isByProduct ? selectedSubtotal : allSubtotal;
```

Manter `fullSubtotal` para o guard do `useEffect` (linha 283) — ele só precisa saber se há algo a cobrar; usar `pendingSubtotal > 0` é até mais preciso, então trocar o check para `pendingSubtotal <= 0 && fullSubtotal <= 0` para não fechar prematuramente em casos de fallback.

Nenhuma outra alteração: o cálculo de desconto, taxa de serviço, total, troco, split e validações já derivam de `subtotal` e continuam corretos automaticamente.

## Validação
1. Comanda 5×R$10, pagar 1 item parcial em "Por produto" → após confirmar, reabrir pagamento e ir em "Tudo": Total mostra **R$ 40,00**.
2. Pagar o restante em "Tudo" com R$40 em dinheiro → confirma sem precisar reselecionar itens.
3. Cenário de mesa com 2 comandas, 1 totalmente paga + 1 com R$30 pendente → "Tudo" mostra R$30 (assumindo `liveItemsForPayment` carregado).
4. Comanda sem pagamento parcial → comportamento atual preservado (subtotal = total bruto).
