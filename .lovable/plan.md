## Diagnóstico

Encontrei duplicidade real em `delivery_orders`: dois pedidos recentes do mesmo cliente, mesmo telefone, mesmos itens e mesmo total, criados com 31 segundos de diferença. Não há duplicidade em `pdv_cashier_movements` para o mesmo `delivery_order_id`, então o problema principal parece estar na criação repetida do pedido pelo cardápio digital, não no registro financeiro do caixa.

## Plano de correção

1. **Bloquear duplo envio no checkout do cardápio**
   - Adicionar uma trava local no `OrderConfirmation` para impedir clique duplo/submit repetido enquanto o pedido está sendo criado.
   - Manter o botão “Confirmar Pedido” desabilitado até o fluxo terminar e evitar múltiplas chamadas ao `createOrder.mutate`.

2. **Adicionar idempotência server-side na criação do pedido**
   - Criar um campo/chave de idempotência em `delivery_orders`, gerado por tentativa de checkout.
   - Adicionar índice único para garantir que a mesma tentativa de checkout não crie dois pedidos, mesmo com duplo clique, retry do navegador ou latência.
   - Ajustar `useCreateOrder` para usar `upsert`/tratamento de conflito pela chave de idempotência e retornar o pedido já existente quando a tentativa já tiver sido processada.

3. **Evitar itens duplicados em pedidos idempotentes**
   - Só inserir `delivery_order_items` e `delivery_order_item_options` quando o pedido for realmente novo.
   - Se o pedido já existir por idempotência, retornar o pedido existente sem inserir itens novamente.

4. **Reforçar o registro no caixa contra duplicidade concorrente**
   - Adicionar/garantir índice único em `pdv_cashier_movements.delivery_order_id` quando o movimento vem de delivery.
   - Isso impede que dois operadores/duplo clique registrem o mesmo pedido duas vezes no caixa em condições de corrida.

5. **Limpar a exibição da fila, se necessário**
   - Manter a fila agrupada por `id` do pedido e invalidada via Realtime.
   - Não ocultar pedidos distintos por heurística visual; a prevenção deve acontecer na criação.

## Resultado esperado

- Duplo clique ou reenvio no cardápio digital não cria novo pedido duplicado.
- O mesmo pedido não pode gerar dois movimentos financeiros no caixa.
- Pedidos legitimamente diferentes continuam sendo aceitos normalmente.