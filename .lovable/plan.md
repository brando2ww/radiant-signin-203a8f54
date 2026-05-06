# Persistir o acompanhamento do pedido após reload

Hoje o `trackingOrderId` vive apenas no estado do `CheckoutFlow`. Ao recarregar a página, o sheet some e o cliente perde o acompanhamento. Vamos persistir o pedido ativo em `localStorage` por estabelecimento e exibir um chip flutuante "Acompanhar pedido" sempre que houver um pedido em andamento — funcionando mesmo após reload, mesmo se o usuário fechou o sheet.

## 1. Helper de persistência

Criar `src/lib/active-order-storage.ts`:

- Chave: `velara:active-order:{userId}`
- API: `getActiveOrderId(userId)`, `setActiveOrderId(userId, orderId)`, `clearActiveOrderId(userId)`
- Dispara `CustomEvent("velara:active-order-changed")` para notificar listeners no mesmo tab; também escuta `storage` para sincronizar entre abas.

## 2. Hook `useActiveOrder(userId)`

Criar `src/hooks/use-active-order.ts`:

- Lê do localStorage o id atual e mantém em estado.
- Faz query no Supabase desse pedido (`delivery_orders`) com realtime subscription para conhecer status atual.
- Se pedido vier inexistente, cancelado há mais de 1h, ou status `completed` há mais de 30 minutos → limpa automaticamente.
- Retorna `{ orderId, order, clear() }`.

## 3. `CheckoutFlow.tsx`

- Em `handleOrderPlaced(orderId)` → chamar `setActiveOrderId(userId, orderId)` antes de mostrar tracking.
- Em `handleCloseTracking` → **não** limpar o storage; apenas fechar o sheet (cliente pode reabrir pelo chip). A limpeza acontece quando ele cancela explicitamente ou quando o pedido finaliza.
- Quando abrir o `CheckoutFlow` (prop `open`) e existir um active order do usuário, abrir direto no step `tracking` em vez de `phone`. (Isso permite reabrir pelo botão do carrinho também.)

## 4. Chip flutuante "Acompanhar pedido"

Criar `src/components/public-menu/ActiveOrderChip.tsx`:

- Usa `useActiveOrder(userId)`.
- Quando há pedido ativo, renderiza botão `fixed bottom-20 right-4 z-40` (acima do botão do carrinho), com ícone `Bike`/`ChefHat` conforme status, label "Pedido #NNN — Em preparo" e badge pulsante.
- Ao clicar, abre o sheet de tracking diretamente. O sheet é controlado por estado local no chip, renderizando `<Sheet>` + `<OrderTrackingView>` (mesma estrutura que o `CheckoutFlow` faz).
- Botão "Cancelar acompanhamento" no rodapé do sheet (ou um X), que chama `clearActiveOrderId`.

## 5. Integração no `PublicMenu.tsx`

Adicionar `<ActiveOrderChip userId={userId} />` ao lado do `<ShoppingCart>`, dentro do `<div>` raiz.

## 6. Limpeza automática

- Quando `order.status === "completed"` ou `cancelled`, agendar `clearActiveOrderId` após 5 minutos para não acumular pedidos antigos. Enquanto isso, o chip ainda mostra status final ("Entregue!") como confirmação.
- Se a query retornar `null` (pedido apagado/inacessível), limpar imediatamente.

## Detalhes técnicos

- localStorage é client-side; nada precisa mudar no banco — o RLS já permite `SELECT` no `delivery_orders` por id (verificar `select` policy; se restritiva, talvez precise de uma policy pública por id — checar antes de implementar; provavelmente já existe pois o `OrderTrackingView` já consulta com sucesso).
- Sem alterações em pagamentos ou status — apenas leitura/realtime e UI.
- Arquivos: `src/lib/active-order-storage.ts`, `src/hooks/use-active-order.ts`, `src/components/public-menu/ActiveOrderChip.tsx`, edits em `src/components/public-menu/CheckoutFlow.tsx`, `src/pages/PublicMenu.tsx`.
