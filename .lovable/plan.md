## Ajuste: cliente confirma recebimento, restaurante confirma pagamento

A confirmação de **pagamento** continua exclusiva do operador de caixa (já implementado, com trigger que bloqueia conclusão sem `cashier_confirmed_at`). Vou adicionar uma camada paralela de **confirmação de recebimento pelo cliente**, que é apenas informativa e nunca conclui o pedido nem dá baixa financeira.

### Mudanças

**1. Migration**
- Adicionar coluna `customer_delivery_confirmed_at timestamptz` em `delivery_orders` (nullable).
- Política RLS adicional para `UPDATE` por `anon`/`authenticated` permitindo atualizar **somente** essa coluna (com `WITH CHECK` que verifica `payment_status`, `status` e `cashier_confirmed_at` permaneceram inalterados em relação à linha original).

**2. `src/components/public-menu/checkout/OrderTrackingView.tsx`**
- Quando `status === 'delivering'` e ainda não confirmado pelo cliente: exibir botão **"Confirmar recebimento"** com nota: *"Isso apenas avisa o restaurante que você recebeu. O pagamento é registrado separadamente no caixa."*
- Ao clicar, faz `update delivery_orders set customer_delivery_confirmed_at = now()` (RLS garante que só esse campo passa).
- Quando já confirmado, exibe badge "Recebimento confirmado por você" com timestamp.
- A timeline ganha indicador secundário "✓ Cliente confirmou recebimento" entre as etapas "Saiu para entrega" e "Aguardando pagamento" (não substitui nenhuma etapa existente).

**3. `src/components/pdv/cashier/DeliveryQueueCard.tsx`**
- Quando `customer_delivery_confirmed_at` está preenchido E pedido ainda em `delivering` sem pagamento: badge informativo verde **"Cliente confirmou recebimento"** ao lado do "Aguardando pagamento". Ajuda o operador a priorizar o registro no caixa.

**4. `src/hooks/use-delivery-orders.ts`**
- Adicionar `customer_delivery_confirmed_at: string | null` ao tipo `DeliveryOrder`.

### Regras preservadas

- Botão de "Marcar entregue" continua bloqueado para pagamento na entrega sem registro no caixa.
- Trigger SQL `delivery_block_unpaid_completion` continua impedindo `status = 'completed'` sem `cashier_confirmed_at`.
- Confirmação do cliente NÃO altera `status`, `payment_status`, nem `cashier_confirmed_at`.
- Pagamento (registro de recebimento financeiro) permanece exclusivo do operador via `usePDVDeliveryCheckout`.
