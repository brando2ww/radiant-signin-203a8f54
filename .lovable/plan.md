## Problemas

1. **Número do pedido enorme** (ex: `#13308361`) — gerado com `Date.now().toString().slice(-8)` em `src/hooks/use-delivery-customers.ts`.
2. **Pedido novo do delivery não imprime sozinho** — em `src/hooks/use-delivery-orders.ts`, o `dispatchDeliveryPrintJobs` só é chamado quando o pedido é confirmado (manual ou via `auto_accept_orders`). Pedidos que ficam em "pendente" não disparam impressão.

## Correções

### 1. Numeração sequencial diária por estabelecimento
Em `src/hooks/use-delivery-customers.ts`, substituir o `Date.now().slice(-8)` por uma contagem dos pedidos do dia para o `userId` e formatar como `#001`, `#002`…:

```ts
const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
const { count } = await supabase
  .from("delivery_orders")
  .select("id", { count: "exact", head: true })
  .eq("user_id", orderData.userId)
  .gte("created_at", startOfDay.toISOString());
const orderNumber = `#${String((count || 0) + 1).padStart(3, "0")}`;
```

### 2. Impressão automática ao receber pedido
Em `src/hooks/use-delivery-orders.ts`, no realtime `INSERT`:
- Sempre disparar `dispatchDeliveryPrintJobs(newOrder.id)` para pedidos do tenant logado (independente de `auto_accept_orders`).
- Manter a lógica de auto-confirmação como está, mas **sem duplicar** a impressão (se auto-confirmar, fazer apenas uma vez).

Fluxo final ao chegar pedido novo:
1. Toca som + toast "Novo pedido".
2. Imprime na cozinha automaticamente.
3. Se `auto_accept_orders` ligado → confirma e baixa estoque (sem reimprimir).

## Arquivos
- `src/hooks/use-delivery-customers.ts` (numeração)
- `src/hooks/use-delivery-orders.ts` (impressão automática no INSERT)
