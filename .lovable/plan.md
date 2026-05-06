## Objetivo

Tratar o fluxo "pagar na entrega" de forma distinta do "pago online", garantindo que o pedido só seja marcado como **Entregue e pago** quando o caixa registrar o recebimento, e que o cliente veja informações claras sobre o pagamento.

---

## 1. Status "Aguardando pagamento" (já existe parcialmente)

Hoje o fluxo do operador é `pending → preparing → ready → delivering → completed`. Para pedidos com pagamento na entrega, vamos:

- Adicionar uma sub-etapa visual **"Aguardando pagamento"** quando `status = 'delivering'` E `payment_status != 'paid'`. Não criar novo status no enum (evita migration disruptiva); usar combinação dos dois campos.
- O botão "Marcar entregue" no `DeliveryQueueCard` para esses pedidos passa a ser **desabilitado** quando `payment_status != 'paid'`, mostrando ao invés o botão "Registrar pagamento" (que já dispara `DeliveryPaymentDialog` e marca `completed` + `delivered_at` ao confirmar via `usePDVDeliveryCheckout`).
- Pedidos pagos online em `delivering` continuam com o botão "Marcar entregue" normal.

**Arquivo:** `src/components/pdv/cashier/DeliveryQueueCard.tsx` — ajustar `NEXT_STATUS_LABEL` e a renderização condicional. `src/components/delivery/OrderStatusBadge.tsx` — aceitar prop opcional `paymentStatus` para renderizar o badge "Aguardando pagamento" em laranja quando aplicável.

## 2. Confirmação automática + pagar na entrega

`useDeliveryOrders` já trata `auto_accept_orders` corretamente para qualquer forma de pagamento (vai direto a `preparing`). Vamos apenas:

- Garantir que o `payment_status` permaneça `pending` até o caixa registrar (já é o caso).
- Quando `auto_accept_orders = false` E pagamento na entrega, o card no painel exibe rótulo extra **"Aguardando confirmação · Pagar na entrega"** no `DeliveryQueueCard` para destacar o risco que o restaurante assume.

## 3. Tela do cliente (acompanhamento)

Atualmente, o `OrderConfirmation` apenas dispara `onOrderComplete` e fecha o modal — não há tela de acompanhamento pós-pedido. Vamos criar uma:

**Novo componente:** `src/components/public-menu/checkout/OrderTrackingView.tsx`

- Recebe `orderId` e faz `useQuery` em `delivery_orders` (com realtime via subscribe no `id`).
- Linha do tempo com 5 etapas: Recebido → Em preparo → Saiu para entrega → **Aguardando pagamento** (somente se `payment_method ∈ {cash, credit, debit}` E `payment_status != 'paid'`) → Entregue e pago.
- Bloco fixo de pagamento exibindo:
  - Forma escolhida (`Dinheiro` / `Cartão na entrega` / `PIX na entrega`).
  - Se `cash` e `change_for > total`: "Levar troco para R$ X,XX" e cálculo do troco.
  - Total destacado.
- Quando `status = 'delivering'`: aviso amarelo "Tenha o pagamento pronto para o entregador" (com troco se aplicável).
- Quando `status = 'cancelled'`: bloco vermelho com `cancellation_reason` e mensagem "Nenhuma cobrança realizada — pagamento na entrega não gera cobrança prévia".

**Integração:** `CheckoutFlow.tsx` — em `handleOrderPlaced`, ao invés de fechar o modal, alternar para um novo `currentStep = "tracking"` que renderiza `OrderTrackingView`. O usuário pode fechar manualmente.

## 4. Regra de negócio no backend (migration)

Para garantir que pedido "pagar na entrega" **nunca** seja marcado como `completed` sem registro no caixa:

**Migration:** trigger `BEFORE UPDATE` em `delivery_orders` que rejeita transição para `status = 'completed'` quando `payment_status != 'paid'` E `cashier_confirmed_at IS NULL` E `payment_method` é offline (`cash`, `credit`, `debit`). Pedidos com `payment_status = 'paid'` (online) passam normal.

```text
IF NEW.status = 'completed'
   AND OLD.status <> 'completed'
   AND NEW.payment_method IN ('cash','credit','debit')
   AND NEW.payment_status <> 'paid'
   AND NEW.cashier_confirmed_at IS NULL
THEN RAISE EXCEPTION 'Pedido com pagamento na entrega só pode ser concluído após registro no caixa';
```

`usePDVDeliveryCheckout.register` já seta os 3 campos juntos, então não quebra.

## 5. Alerta de atraso de pagamento

Quando um pedido entra em `delivering` com pagamento na entrega, e passa de X minutos sem `cashier_confirmed_at`, alertar o gestor.

**Implementação simples (client-side, sem cron):**
- Em `SalonQueuePanel`, derivar `overduePaymentOrders = orders.filter(o => o.status==='delivering' && o.payment_status!=='paid' && minutesSince(o.updated_at) > threshold)`.
- Threshold configurável em `delivery_settings` (novo campo `payment_overdue_minutes integer default 30`).
- Banner no topo da fila do caixa: "⚠ N pedido(s) sem pagamento registrado há mais de X min" com lista clicável. Toast sonoro (reaproveita `/notification.mp3`) a cada novo pedido que cruza o limiar.

**Migration adicional:** `ALTER TABLE delivery_settings ADD COLUMN payment_overdue_minutes integer NOT NULL DEFAULT 30;` + UI em `src/components/pdv/delivery/...Settings` (campo numérico).

---

## Resumo das alterações

**Migrations**
1. Trigger `delivery_orders_block_unpaid_completion`.
2. Coluna `delivery_settings.payment_overdue_minutes`.

**Frontend**
- `src/components/pdv/cashier/DeliveryQueueCard.tsx` — bloquear "Marcar entregue" quando não pago; rótulo "Aguardando pagamento" / "Aguardando confirmação · Pagar na entrega".
- `src/components/delivery/OrderStatusBadge.tsx` — variante "Aguardando pagamento".
- `src/components/pdv/cashier/SalonQueuePanel.tsx` — banner de pedidos com pagamento atrasado.
- `src/components/public-menu/checkout/OrderTrackingView.tsx` — **novo** (timeline + bloco de pagamento + avisos).
- `src/components/public-menu/CheckoutFlow.tsx` — adicionar step `"tracking"` após confirmação.
- Arquivo de configurações de delivery — campo `payment_overdue_minutes`.

**Sem alterações**
- `useDeliveryOrders` (auto-accept já correto).
- `usePDVDeliveryCheckout` (já marca tudo atomicamente).
- Enum de status (não muda).
