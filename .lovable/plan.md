## Causa

Ao "Cancelar mesa" no salão, `useCancelOrder` (em `src/hooks/use-pdv-orders.ts`) só executa:

```sql
UPDATE pdv_orders SET status='cancelada', cancelled_at=now()
```

e em `Salon.tsx` libera a `pdv_tables`. Porém **nada cancela as `pdv_comandas` filhas**. Elas continuam com `status='aberta'` e seus itens (`sent_to_kitchen_at`) seguem aparecendo em `getPendingPaymentComandas()` no caixa.

Resultado:
- A "comanda fantasma" (sem mesa, com pedido cancelado) aparece na fila do salão / é elegível ao atalho F5.
- Ao apertar F5 em `Cashier.tsx` (linhas 226–244), o handler chama `handleSelectComanda(first, …)` → abre `PaymentDialog`.
- `PaymentDialog` (efeito da linha 370) imediatamente chama `markAsCharging` para travar `em_cobranca`. Como a comanda referencia um order cancelado e uma mesa já liberada, derivações como `tableComandas`/`liveItemsForPayment` ficam inconsistentes — combinado com realtime do `usePDVComandasRealtime` reinvalidando queries enquanto o `markAsCharging` está em voo, a UI entra num ciclo de re-render que parece "congelar".

## Correção

### A. Banco — RPC `pdv_cancel_order` que cascateia (migration)

Criar (e usar) função `public.pdv_cancel_order(p_order_id uuid, p_reason text)` que numa única transação:

1. Marca `pdv_orders` como `cancelada` (com `cancelled_at`, `cancellation_reason`).
2. Atualiza todas as `pdv_comandas` desse `order_id` que estejam em `aberta`/`aguardando_pagamento`/`em_cobranca` para `cancelada` (com `updated_at = now()`, `close_reason = p_reason`).
3. Libera a mesa (`pdv_tables`: `current_order_id = NULL`, `status='livre'`) se ela ainda apontar para esse pedido.
4. Registra `log_pdv_action('close_attendance', 'order', …)`.
5. Verifica permissão via `has_pdv_action('cancel_item')` ou similar (papel já permite cancelar pelo caixa/proprietário/gerente).

Bloqueia se houver itens já pagos (`paid_quantity > 0`) ou em cobrança (`charging_session_id IS NOT NULL`) — nesse caso `RAISE EXCEPTION 'Mesa possui itens pagos/em cobrança'`.

### B. Frontend

1. `src/hooks/use-pdv-orders.ts` → `cancelOrder` passa a chamar `supabase.rpc('pdv_cancel_order', { p_order_id, p_reason })`. `onSuccess` invalida `pdv-orders`, `pdv-comandas`, `pdv-comanda-items`, `pdv-tables`.
2. `src/pages/pdv/Salon.tsx` → `handleCancelOrder` deixa de fazer o `updateTable(... livre ...)` manual (RPC já libera).
3. `src/pages/pdv/Cashier.tsx` → handler `onCancelTable` (linhas 397–404) também passa a chamar a mesma RPC, removendo o loop de `cancelComanda` por comanda.
4. **Cinto e suspensório** em `getPendingPaymentComandas` (`src/hooks/use-pdv-comandas.ts`): também filtrar comandas cujo `pdv_orders.status === 'cancelada'`. Para isso, juntar com `orders` já carregadas em `usePDVOrders` ou adicionar `cancelled_at`/`order_status` ao select de comandas. Mais simples: no `Cashier.tsx`, ao montar a lista exibida, descartar comandas cujo `order_id` esteja entre `salonOrders.filter(o => o.status === 'cancelada')`.

### C. Atalho F5 — proteção

Em `Cashier.tsx` (case "F5"): após `getPendingPaymentComandas()`, descartar entradas sem itens vivos (`getItemsByComanda(c.id).length === 0`) antes de escolher a primeira. Garante que mesmo dados em transição (cache invalidando) não levem o dialog para um estado vazio.

## Verificação

1. Cancelar Mesa 4 no salão → ver `pdv_comandas` e `pdv_tables` voltarem a `cancelada` / `livre`.
2. F5 no caixa logo em seguida → não deve abrir nenhum PaymentDialog se não houver outras pendências; se houver, deve abrir a próxima válida sem travar.
3. Conferir log em `pdv_action_audit_log` com `action='close_attendance'`, `target_type='order'`.
