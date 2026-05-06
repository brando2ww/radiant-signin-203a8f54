## Objetivo

Na tela `/pdv/caixa`, dentro do painel **Delivery** (aba lateral direita), adicionar dois atalhos por pedido para que o operador não precise navegar até `/pdv/delivery/pedidos`:

1. **Marcar como pronto / avançar status** — botão que avança o pedido para o próximo estágio (`preparing → ready → delivering → completed`) sem sair da tela.
2. **Imprimir comanda do motoboy** — botão que dispara uma impressão completa para entrega (cliente, telefone, endereço, itens, forma de pagamento, troco, total, observações).

## Mudanças

### 1. `src/components/pdv/cashier/DeliveryQueueCard.tsx`
- Adicionar duas novas props opcionais: `onAdvanceStatus(order)` e `onPrintMotoboy(order)`.
- Adicionar uma linha de botões compactos acima/abaixo do botão de pagamento existente:
  - Botão **Avançar** com label dinâmico de acordo com o status atual:
    - `pending`/`confirmed` → "Iniciar preparo"
    - `preparing` → "Marcar pronto"
    - `ready` → "Saiu para entrega"
    - `delivering` → "Marcar entregue"
    - `completed`/`cancelled` → ocultar
  - Botão **Imprimir motoboy** (ícone `Printer`) — sempre visível.
- Manter o botão de pagamento/confirmação online já existente quando `actionable`.

### 2. `src/components/pdv/cashier/SalonQueuePanel.tsx`
- Importar `useUpdateOrderStatus` de `@/hooks/use-delivery-orders`.
- Criar handler `handleAdvanceStatus(order)` que chama `updateOrderStatus.mutate({ id, status: next })` usando o mapa de fluxo (`pending/confirmed → preparing`, `preparing → ready`, `ready → delivering`, `delivering → completed`).
- Criar handler `handlePrintMotoboy(order)` que dispara `printMotoboyReceipt(order)` (nova função, ver item 3).
- Passar ambos para `<DeliveryQueueCard />`.

### 3. `src/lib/print-motoboy-receipt.ts` (novo arquivo)
- Função `printMotoboyReceipt(order: DeliveryOrder)` que abre uma janela de impressão (mesma estratégia já usada em `print-fiscal-receipt.ts` / `CloseCashierDialog.printCashierReport`) com layout 80mm contendo:
  - Cabeçalho: `COMANDA DELIVERY #<order_number>` + data/hora.
  - **Cliente**: nome, telefone (formatado).
  - **Endereço**: `delivery_address_text` (ou "RETIRADA NO BALCÃO" se `order_type === "pickup"`).
  - **Itens**: `quantidade × nome` + adicionais (`delivery_order_item_options`) + observação por item.
  - **Resumo financeiro**: subtotal, taxa de entrega, desconto, total.
  - **Pagamento**: método (label PT-BR via util já existente), status (`Pago online` / `A receber`), troco para (se `change_for`).
  - **Observações** gerais do pedido.
  - Rodapé curto.
- Usar `window.open` + `print()`, mesma abordagem do projeto (não imprimir via fila térmica para garantir que sai pela impressora padrão do navegador, que costuma ser a do balcão/motoboy).

### 4. (opcional) Alternativa para impressão térmica
Se o estabelecimento tiver impressora configurada por centro de produção, também enfileirar um job em `pdv_print_jobs` reutilizando `dispatchDeliveryPrintJobs(order.id)`. Para evitar duplicidade, a opção padrão será o **diálogo de impressão do navegador** (compatível com qualquer impressora térmica/A4), que é o cenário descrito ("imprimir comanda do motoboy").

## Arquivos afetados

- editar `src/components/pdv/cashier/DeliveryQueueCard.tsx`
- editar `src/components/pdv/cashier/SalonQueuePanel.tsx`
- criar `src/lib/print-motoboy-receipt.ts`

## Resultado

Operador no caixa, olhando para a aba **Delivery**, poderá:
- Avançar status do pedido em 1 clique (sem ir para `/pdv/delivery/pedidos`).
- Imprimir a via física do motoboy com todas as informações de entrega.
- Continuar usando os botões de pagamento/confirmação online já existentes.
