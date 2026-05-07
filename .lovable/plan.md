## Causa

Dois jobs de impressão idênticos (`source_item_id` igual, mesmo `pedido #002`) foram enfileirados com ~510ms de diferença. O dedup atual (`processedIds` em memória no `useDeliveryOrdersWatcher`) só protege **dentro de uma única aba**. Como o usuário tem várias abas do PDV abertas (visível no print), cada aba recebe o mesmo evento realtime de INSERT e dispara `dispatchDeliveryPrintJobs` em paralelo. Por isso a comanda imprime duplicada na cozinha.

## Solução

Dedup no servidor: antes de enfileirar jobs automáticos, conferir se já existe algum job em `pdv_print_jobs` para os itens daquele pedido. Como a tabela é compartilhada entre todas as abas/sessões, a primeira que conseguir inserir "vence"; as demais veem que já existe e abortam.

Reimpressão manual continua funcional — ela passa explicitamente por outro caminho e deve ignorar o dedup.

### Mudanças

1. **`src/lib/delivery-print.ts`**
   - Adicionar parâmetro `options?: { auto?: boolean }` em `dispatchDeliveryPrintJobs`.
   - Quando `options.auto === true`, antes do `INSERT` em `pdv_print_jobs`, fazer um `SELECT id FROM pdv_print_jobs WHERE source_kind='delivery' AND source_item_id IN (...) LIMIT 1`. Se já existir, retornar `{ jobs: 0 }` sem inserir nada.
   - A reimpressão manual (em `useReprintOrder` / `use-delivery-orders.ts`) **não** passa `auto`, portanto sempre prossegue.

2. **`src/hooks/use-delivery-orders-watcher.ts`**
   - Chamar `dispatchDeliveryPrintJobs(newOrder.id, undefined, { auto: true })`.
   - Manter o dedup local em `processedIds` (proteção extra dentro da mesma aba).

### Por que não usar uma coluna `auto_printed_at` no `delivery_orders`

Seria mais explícito (UPDATE atômico com `WHERE auto_printed_at IS NULL`), mas exige migration. A checagem em `pdv_print_jobs` já resolve o caso real porque a inserção dos jobs é o efeito colateral observável; se já houver jobs, a impressão já foi (ou está sendo) processada. Caso futuramente queiramos reforçar a garantia, podemos adicionar a coluna em uma próxima iteração.

### Resultado esperado

Mesmo com várias abas do PDV abertas, apenas um conjunto de jobs entra em `pdv_print_jobs` por pedido novo do delivery → uma única impressão na cozinha. Reimpressão manual continua imprimindo normalmente.
