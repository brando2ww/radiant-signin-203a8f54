## Confirmação automática de pedidos do delivery

A opção já existe na UI em **Delivery → Configurações → Notificações** (toggle "Aceitar Pedidos Automaticamente"), e o campo `auto_accept_orders` já está em `delivery_settings`. Falta apenas conectar o toggle ao fluxo real de chegada de pedidos.

## Mudança

`src/hooks/use-delivery-orders.ts` — no listener realtime de `delivery_orders` (evento `INSERT`):

1. Buscar `delivery_settings.auto_accept_orders` do usuário logado.
2. Se ativo e o pedido pertence ao usuário e está com `status = "pending"`:
   - Atualizar `status = "confirmed"` e `confirmed_at = now()`.
   - Chamar RPC `consume_ingredients_for_delivery_order` para baixar estoque (mesma lógica usada em confirmação manual).
   - Disparar `dispatchDeliveryPrintJobs(orderId)` para impressão na cozinha.
   - Mostrar toast informando auto-confirmação.

Tudo feito client-side, reutilizando a mesma lógica de `useUpdateOrderStatus`. Sem alterações de banco.

## Observação

A confirmação dispara em qualquer aba aberta com o painel de pedidos. Como o update já recebe `status = confirmed` antes que outra aba consiga processar, não há risco de duplicar baixa de estoque (a RPC `consume_ingredients_for_delivery_order` já é idempotente).
