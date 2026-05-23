## Causa

Ao cobrar um delivery em "Várias formas", o caixa registra apenas a primeira linha (R$ 30 em dinheiro) e silenciosamente perde as demais (R$ 21,92 em PIX). O Postgres rejeita o INSERT da segunda linha com:

```
duplicate key value violates unique constraint "uq_pdv_cashier_movements_delivery_order"
```

Existe um índice único parcial em `pdv_cashier_movements(delivery_order_id) WHERE delivery_order_id IS NOT NULL` que limita a 1 movimento por pedido — incompatível com pagamento em múltiplas formas. A primeira chamada (`registerDeliveryPayment`) também marca `cashier_confirmed_at`, então a proteção contra cobrança duplicada já existe no `delivery_orders`; o índice único no movimento é redundante e prejudicial.

## Solução

1. **Migration** — remover o índice único e manter apenas o índice não-único para performance.
   ```sql
   DROP INDEX IF EXISTS public.uq_pdv_cashier_movements_delivery_order;
   ```
   O índice `idx_pdv_cashier_movements_delivery_order` permanece.

2. **Tornar o erro visível no front** — `registerDeliveryExtraPaymentLine` hoje não tem `onError`, então qualquer falha (RLS, FK, constraint) some no console e a UI segue para a tela de sucesso. Adicionar `onError` com `toast.error` ao `registerExtra` em `src/hooks/use-pdv-delivery-checkout.ts`, igual ao `register`.

3. **Validação** — após a migration, refazer um pagamento split (dinheiro + PIX) em um pedido de delivery e conferir no console do banco que ambos os movimentos foram inseridos e somam o total do pedido.

### Sem mudanças

- Lógica de UI do `PaymentDialog` (split funciona corretamente).
- `SalonQueuePanel`, hooks de relatório, fluxo de cupom.

### Arquivos

- nova migration SQL drop do índice único
- `src/hooks/use-pdv-delivery-checkout.ts` (adicionar `onError` em `registerExtra`)
