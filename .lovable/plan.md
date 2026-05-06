## Mudança

Incluir a **quantidade** de cada adicional na comanda do motoboy (recibo HTML 80mm).

A view `vw_print_bridge_delivery_items` já agrega `quantity` por adicional (mudança aplicada anteriormente). O recibo do motoboy (`src/lib/print-motoboy-receipt.ts`) já lista os adicionais, mas só mostra `option_name: item_name` sem o multiplicador.

## Arquivos

### `src/hooks/use-delivery-orders.ts`
Adicionar campo opcional `quantity?: number` na interface `DeliveryOrderItemOption`.

### `src/lib/print-motoboy-receipt.ts`
No bloco que monta `opts`, prefixar `Nx ` antes do `item_name` quando `op.quantity > 1`:

```ts
const qtyPrefix = op.quantity && Number(op.quantity) > 1
  ? `${op.quantity}× `
  : "";
return `<div class="opt">+ ${escape(op.option_name)}: ${qtyPrefix}${escape(op.item_name)}${
  Number(op.price_adjustment) > 0
    ? ` (${formatBRL(Number(op.price_adjustment) * Number(op.quantity || 1))})`
    : ""
}</div>`;
```

Isso faz a comanda do motoboy mostrar, ex.: `+ Sabores: 8× Hot Doce (R$ 152,00)` em vez de só `+ Sabores: Hot Doce (R$ 19,00)`.

Sem migração — só ajuste de cliente.
