## Problema

Ao clicar em "Marcar pronto" (e demais ações de avançar status) no card de delivery do caixa (`SalonQueuePanel` → `DeliveryQueueCard`), o status no banco é atualizado, mas o card visível só reflete a mudança após recarregar a página.

Causa: `useUpdateOrderStatus` (em `src/hooks/use-delivery-orders.ts`) só invalida a query `["delivery-orders"]`. A fila do caixa usa outra query — `["pdv-delivery-queue", visibleUserId]` (em `src/hooks/use-pdv-delivery-queue.ts`) — que não é invalidada. O realtime existe mas é instável (depende de canal/filtro ativo e da Replication estar habilitada), por isso o usuário precisa recarregar.

## Mudança

Em `src/hooks/use-delivery-orders.ts`, no `onSuccess` de `useUpdateOrderStatus`, também invalidar:

- `["pdv-delivery-queue"]` (fila do caixa — sem `visibleUserId` para invalidar todas as variantes)
- `["delivery-order-stats"]` (contadores)

Isso garante que ao clicar em "Marcar pronto"/"Saiu p/ entrega"/etc, o card no caixa atualiza imediatamente, sem depender de realtime nem reload.

## Escopo

- Arquivo único: `src/hooks/use-delivery-orders.ts` (mutation `useUpdateOrderStatus`, bloco `onSuccess`).
- Sem mudanças de UI, sem mudanças de banco, sem mudanças em `DeliveryQueueCard.tsx` ou `SalonQueuePanel.tsx`.
