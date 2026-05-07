## Causa raiz da impressão duplicada

O job de impressão da cozinha é enfileirado em **dois lugares** para o mesmo pedido:

1. `src/hooks/use-delivery-orders-watcher.ts` (linha 92): no INSERT do pedido (realtime), chama `dispatchDeliveryPrintJobs(newOrder.id)` — sempre, com ou sem auto-aceite.
2. `src/hooks/use-delivery-orders.ts` (linha 185): dentro de `useUpdateOrderStatus`, na primeira confirmação (status `confirmed` ou `preparing` sem `confirmed_at`), chama `dispatchDeliveryPrintJobs(id)` de novo.

Como `dispatchDeliveryPrintJobs` insere novos jobs em `pdv_print_jobs` toda vez que é chamado (sem checagem de idempotência), a cozinha imprime 2x:
- 1x quando o pedido entra (watcher)
- 1x quando o operador clica "Confirmar"/"Iniciar Preparo" (mutation)

Quando o auto-aceite está ligado, o watcher também aciona o `update` para `preparing` — mas via SQL direto, não pela mutation, então não duplica nesse cenário. A duplicação acontece no fluxo manual.

## Correção

### `src/hooks/use-delivery-orders.ts`
Remover o bloco que chama `dispatchDeliveryPrintJobs` dentro de `useUpdateOrderStatus` (linhas ~183–191). Manter apenas a baixa de estoque (`consume_ingredients_for_delivery_order`).

A impressão automática continua a cargo do watcher (uma vez por pedido). A reimpressão manual permanece disponível via `useReprintOrder` → botão na UI.

### Limpeza
Remover o import `dispatchDeliveryPrintJobs` se não for mais usado em `use-delivery-orders.ts` — porém `useReprintOrder` (linha ~250) ainda usa, então o import continua necessário.

## Resultado
Cada pedido novo gera apenas um conjunto de impressões para os centros de produção. Reimpressão manual segue funcionando.