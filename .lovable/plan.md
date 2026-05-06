# Sumir o chip automaticamente após entrega ou confirmação do cliente

Hoje o chip só some 30 min após `completed`. O usuário quer que ele desapareça **na hora** quando:
- O restaurante marca como entregue (`status = "completed"`).
- O cliente confirma o recebimento (`customer_delivery_confirmed_at` preenchido).

## Mudanças

### `src/hooks/use-active-order.ts`
- Adicionar `customer_delivery_confirmed_at` no tipo `ActiveOrder` e no `SELECT`.
- Substituir o `useEffect` de auto-limpeza:
  - Se `order.status === "completed"` → `clearActiveOrderId(userId)` imediatamente.
  - Se `order.status === "cancelled"` → manter por 1 h (cliente vê o motivo) e depois limpar.
  - Se `order.customer_delivery_confirmed_at` setado → `clearActiveOrderId(userId)` imediatamente.
- Como o realtime já atualiza `order`, a limpeza dispara assim que o evento chega — chip some sem reload.

### `src/components/public-menu/checkout/OrderTrackingView.tsx`
- Após `handleConfirmReceived` ter sucesso, chamar `clearActiveOrderId(userId)` para que o chip desapareça e o sheet possa ser fechado.
- O `OrderTrackingView` precisa receber `userId` como prop (passar a partir de `CheckoutFlow` e `ActiveOrderChip`).

### `src/components/public-menu/CheckoutFlow.tsx` e `ActiveOrderChip.tsx`
- Repassar `userId` ao `OrderTrackingView`.
- No `ActiveOrderChip`, quando `order` se tornar `null` (após auto-limpeza), o `Sheet` que esteja aberto deve fechar — controlar via `useEffect` que zera `open` quando `orderId` vira null.

Sem mudanças de banco. Sem mudanças de regra: pagamento continua exclusivo do caixa.
