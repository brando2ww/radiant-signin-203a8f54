# Destacar número do pedido na comanda do delivery

Ajuste visual no template de impressão da comanda do motoboy (`src/lib/print-motoboy-receipt.ts`) para dar mais destaque ao número do pedido.

## Mudanças

No bloco do cabeçalho (`.sub`), separar o número do pedido da data e aplicar:
- Fonte aproximadamente 20% maior que o atual (de ~11px para ~14px)
- Negrito (`font-weight: bold`)
- Mantém centralizado, logo abaixo do título "COMANDA DELIVERY/RETIRADA"

A data permanece no tamanho atual, em linha separada abaixo do número.

## Arquivo afetado

- `src/lib/print-motoboy-receipt.ts` — adicionar classe `.order-number` no CSS e envolver `Pedido #...` em um `<div class="order-number">`.

Nenhuma mudança em lógica, dados ou outros componentes.
