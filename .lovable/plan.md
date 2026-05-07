Remover emojis das interfaces de delivery.

Alterações:

- `src/components/delivery/OrdersKanban.tsx`
  - Linha 60: `🛵 Delivery` → `Delivery`
  - Linha 66: `🏪 Retirada` → `Retirada`

- `src/components/delivery/OrderCard.tsx`
  - Linhas 113/115: remover `🏪 ` e `🛵 ` dos badges (mantém ícones lucide MapPin/Package)

- `src/hooks/use-delivery-orders-watcher.ts`
  - Linha 50: `"Novo pedido recebido! 🎉"` → `"Novo pedido recebido!"`

- `src/hooks/use-delivery-customers.ts`
  - Linha 291: `"Pedido realizado com sucesso! 🎉"` → `"Pedido realizado com sucesso!"`