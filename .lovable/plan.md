## Causa raiz

O pedido `Monte Seu Poke` foi criado já com status `preparing` (auto-aceite via trigger `auto_accept_delivery_order` BEFORE INSERT). O watcher em `src/hooks/use-delivery-orders-watcher.ts` (linha 41) ignora qualquer payload que não venha com `status === "pending"`, então a chamada de `dispatchDeliveryPrintJobs` nunca acontece — nenhum job aparece em `pdv_print_jobs` (confirmei via consulta: zero jobs nas últimas 2 horas).

Detalhe extra: removemos antes a impressão do `useUpdateOrderStatus` justamente porque o watcher cobria o INSERT. Com o auto-aceite ativo, esse caminho ficou descoberto.

## Correção

Em `src/hooks/use-delivery-orders-watcher.ts` no callback do INSERT:

1. Aceitar tanto `pending` quanto `preparing` (auto-aceite chega já como `preparing`).
2. Detectar `alreadyAutoAccepted = newOrder.status === "preparing"` e, nesse caso:
   - Pular o bloco de mudança de status para `preparing` (já está).
   - Ainda assim chamar `dispatchDeliveryPrintJobs` e `consume_ingredients_for_delivery_order` (idempotente).
3. Manter o fluxo atual para `pending` (impressão + auto-aceite condicional).

Sem mudanças no banco; o trigger continua válido.
