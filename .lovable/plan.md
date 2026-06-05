# Imprimir comanda de retirada no caixa

## Contexto

Hoje, no card de delivery do caixa (`DeliveryQueueCard`), o botão **Imprimir** com a função `onPrintMotoboy` só aparece para pedidos de entrega (`order_type !== "pickup"`). Pedidos onde o cliente escolheu **retirar no local** ficam sem opção de impressão, mesmo que o gerador de cupom (`print-motoboy-receipt.ts`) já trate o caso e imprima o cabeçalho **"COMANDA RETIRADA"** com itens, adicionais, totais e forma de pagamento.

## O que mudar

### 1. `src/components/pdv/cashier/DeliveryQueueCard.tsx`
- Remover a restrição `!isPickup` do botão de impressão (linhas 237 e 250), passando a renderizá-lo também para pedidos de retirada.
- Quando `isPickup`, trocar:
  - rótulo do botão: **"Motoboy" → "Retirada"**
  - `title` do botão: **"Imprimir comanda do motoboy" → "Imprimir comanda de retirada"**
- Ajustar a condição de fallback "Aguardando finalização do pedido" (linha 284) para refletir que o botão de impressão também aparece em pickup.

### 2. Sem mudanças no gerador de cupom
O arquivo `src/lib/print-motoboy-receipt.ts` já detecta `isPickup` e imprime cabeçalho/endereço corretos. A função reutiliza os mesmos dados (itens, opções/adicionais, subtotal, desconto, total, pagamento, observações).

### 3. Sem mudanças no `SalonQueuePanel`
O handler `handlePrintMotoboy` que dispara `printMotoboyReceipt(order)` já é genérico — basta o card chamá-lo também para pickup.

## Como ficará na UI

No card do caixa para pedidos de retirada aparecerá o botão `🖨 Retirada` ao lado do botão de avançar status, imprimindo um cupom 80mm com:
- Cabeçalho "COMANDA RETIRADA" + nº do pedido
- Cliente e telefone
- Aviso "RETIRADA NO BALCÃO"
- Itens com adicionais e observações
- Subtotal, desconto, total
- Forma de pagamento e badge "PAGO ONLINE" / "A RECEBER"

## Verificação

1. Abrir `/pdv/caixa`, aba Delivery.
2. Pedido com `order_type = pickup` deve mostrar botão **Retirada** com ícone de impressora.
3. Clicar → abre janela de impressão 80mm com todos os itens/adicionais.
4. Pedido com entrega (`order_type = delivery`) continua mostrando o botão **Motoboy** como hoje.
