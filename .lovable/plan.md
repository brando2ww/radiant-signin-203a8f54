Plano para corrigir o número do pedido no delivery:

1. Criar numeração por sessão de caixa
   - Adicionar um campo `ticket_number` também em `delivery_orders`.
   - Criar uma função no banco para atribuir o próximo número do caixa aberto ao pedido de delivery.
   - A contagem será por `cashier_session_id`, ou seja: ao fechar o caixa e abrir outro, o próximo pedido volta para `001`.

2. Fazer o pedido já nascer com número curto
   - No fluxo do cardápio público/delivery, trocar a geração atual por tempo/contagem diária por uma chamada segura ao banco.
   - Ao criar o pedido, procurar o caixa aberto do estabelecimento e gravar:
     - `cashier_session_id` do caixa aberto
     - `ticket_number`: 1, 2, 3...
     - `order_number`: `001`, `002`, `003`...
   - Se não houver caixa aberto, manter fallback controlado para não quebrar o pedido público, mas sem usar `Date.now().slice(-8)`.

3. Corrigir a impressão automática
   - Atualizar a view `vw_print_bridge_delivery_items` para incluir `ticket_number`.
   - Atualizar `src/lib/delivery-print.ts` para enviar `ticket_number` no payload da impressão.
   - Ajustar o payload para não montar `comanda_number` com o `order_number` antigo, evitando saída como `##14321283`.
   - A impressão passará a mostrar `Pedido #001`, `Pedido #002`, etc.

4. Evitar duplicidade e problemas de concorrência
   - Usar função `SECURITY DEFINER` com lock no caixa aberto para garantir que dois pedidos simultâneos não recebam o mesmo número.
   - Criar índice único parcial por caixa: `(cashier_session_id, ticket_number)` para delivery.

5. Ajustar telas que exibem o pedido
   - Cards, detalhes, notificações e fila do caixa continuarão usando `order_number`, que passará a vir curto (`001`).
   - Onde o texto já adiciona `#`, evitar duplicar cerquilhas para não aparecer `##001` quando o valor já vier com `#`.

Detalhes técnicos:
- Arquivos a alterar:
  - `src/hooks/use-delivery-customers.ts`
  - `src/lib/delivery-print.ts`
  - possivelmente componentes que prefixam `#` ao `order_number`
- Banco:
  - migration para `delivery_orders.ticket_number`
  - função `delivery_assign_order_ticket(...)`
  - atualização da view `vw_print_bridge_delivery_items`
- Não vou editar `src/integrations/supabase/types.ts` manualmente.