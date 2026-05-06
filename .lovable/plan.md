## Causa raiz

O watcher `useDeliveryOrdersWatcher` reage ao INSERT em `delivery_orders` e chama `dispatchDeliveryPrintJobs(orderId)` imediatamente. Mas no fluxo de checkout do cardápio público o pedido é criado em três passos:

1. INSERT em `delivery_orders`  ← watcher dispara aqui
2. INSERT em `delivery_order_items`
3. INSERT em `delivery_order_item_options` (adicionais)

Quando o `dispatchDeliveryPrintJobs` lê `vw_print_bridge_delivery_items`, os itens podem já estar lá mas os adicionais ainda não foram persistidos — resultado: payload vai com `options: []` e a comanda do centro de produção sai sem os adicionais.

A comanda do motoboy sai correta porque é impressa por clique do operador (`printMotoboyReceipt`), bem depois de tudo estar gravado.

Confirmado no banco: pedido #014 tem 4 registros em `delivery_order_item_options`, mas o `pdv_print_jobs` correspondente foi gravado com `modifiers: []`.

## Mudança

### `src/hooks/use-delivery-orders-watcher.ts`

Antes de chamar `dispatchDeliveryPrintJobs`, aguardar (poll) até que os itens E os adicionais estejam persistidos:

- Polling a cada 250ms, até 12 tentativas (3s no total).
- Critério: ler `delivery_order_items` (id, count) e `delivery_order_item_options` filtrado por `order_item_id IN (...)`. Sair do loop assim que houver pelo menos 1 item E (não houver opções esperadas OU já existir alguma opção registrada).
- Como não dá para saber se o pedido tinha adicionais, usar uma heurística simples: se houver itens, aguardar mais 500ms para garantir que os options também tenham sido inseridos antes do dispatch. Em paralelo, fazer no máximo 2 leituras de `delivery_order_item_options`; se já houver alguma opção, dispatch imediato.

Implementação resumida:
```ts
// aguarda itens existirem
for (let i = 0; i < 12; i++) {
  const { data: items } = await supabase
    .from("delivery_order_items")
    .select("id")
    .eq("order_id", newOrder.id);
  if (items && items.length > 0) {
    // aguarda options (best-effort 500ms)
    await new Promise(r => setTimeout(r, 500));
    break;
  }
  await new Promise(r => setTimeout(r, 250));
}
await dispatchDeliveryPrintJobs(newOrder.id);
```

Sem alterações em outros arquivos. Sem migração.
