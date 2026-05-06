## Objetivo
Quando `auto_accept_orders` estiver ligado, ao chegar um pedido novo: imprimir + marcar como `preparing` (não mais `confirmed`), pulando a coluna intermediária.

## Mudança
Em `src/hooks/use-delivery-orders.ts`, no listener realtime de INSERT (bloco `if (settings?.auto_accept_orders)`):
- Trocar `status: "confirmed"` por `status: "preparing"`.
- Manter `confirmed_at = now()` para registrar momento da aceitação.
- Manter chamada `consume_ingredients_for_delivery_order` e impressão (já é feita antes do bloco).
- Atualizar toast: "Pedido auto-confirmado e em preparo".

## Arquivos afetados
- `src/hooks/use-delivery-orders.ts`
