## Objetivo
No card de pedido do caixa (`DeliveryQueueCard`), quando o pedido for de retirada (`order_type === "pickup"`):
- Não mostrar o seletor/atribuição de entregador.
- Exibir uma mensagem clara indicando que o cliente irá retirar no local.

## Alterações
**`src/components/pdv/cashier/DeliveryQueueCard.tsx`**
1. Detectar `const isPickup = order.order_type === "pickup"`.
2. Trocar o ícone `Bike` do cabeçalho por `Package`/`Store` quando for retirada e ajustar o subtítulo (ex: "Retirada no local" no lugar do tempo, ou ao lado).
3. No bloco `order.status === "delivering" && drivers.length > 0` (atribuição de motoboy): só renderizar quando `!isPickup`.
4. Quando `isPickup` e `order.status === "delivering"`, mostrar um badge/aviso no lugar:  
   `"📦 Cliente retira no local — aguardando retirada"`.
5. Ajustar o label do botão "Saiu p/ entrega" para "Liberar p/ retirada" quando `isPickup` (apenas label visual, mantém `onAdvanceStatus`).
6. Esconder o botão "Motoboy" (impressão da comanda do motoboy) quando `isPickup`.

Nenhuma mudança em hooks ou banco — apenas UI condicional no card.

## Validação
- Criar pedido de retirada → no caixa o card mostra "Cliente retira no local", sem seletor de entregador e sem botão Motoboy.
- Criar pedido de entrega normal → comportamento atual permanece (seletor de motoboy, botão Motoboy, label "Saiu p/ entrega").
