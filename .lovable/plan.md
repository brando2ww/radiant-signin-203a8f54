## Objetivo
Refazer a UX de `/pdv/delivery/pedidos`: separar Delivery vs Retirada, indicadores reativos ao tipo, novo kanban com colunas dedicadas, cards mais ricos (timer com cor progressiva, entregador, telefone) e coluna lateral compacta de Concluídos.

## Arquivos a alterar/criar

### 1. `src/pages/pdv/delivery/Orders.tsx` (editar)
- Remover título duplicado "Pedidos Delivery". Renderizar apenas `<OrdersTab />` num container com padding.

### 2. `src/components/delivery/OrdersTab.tsx` (refatorar)
- Manter o `NotificationsPanel` no topo direito.
- Adicionar estado local `orderType: "delivery" | "pickup"` (default `delivery`).
- Calcular contadores ativos (`status not in completed/cancelled`) por tipo a partir de `useDeliveryOrders()` para exibir no toggle.
- Trocar os 3 cards de `useOrderStats` por 4 cards filtrados pelo `orderType` (computados client-side a partir de `useDeliveryOrders`):
  - Pedidos Hoje (do tipo, hoje)
  - Receita Hoje (do tipo, hoje, exclui cancelados)
  - Ticket Médio
  - Em andamento (status ≠ completed/cancelled, do tipo)
- Toggle visual logo abaixo dos cards: dois botões grandes lado a lado com ícone (🛵/🏪), label, contador. Botão ativo usa `bg-primary text-primary-foreground`; inativo `bg-muted`. Sem novas cores fora dos tokens (segue regra de cores do sistema).
- Passar `orderType` para `<OrdersKanban orderType={orderType} />`.
- Único título: "Pedidos" + subtítulo dinâmico ("Acompanhe pedidos de delivery em tempo real" / "...de retirada...").

### 3. `src/components/delivery/OrdersKanban.tsx` (refatorar)
- Receber prop `orderType`.
- Definir colunas dinâmicas:
  - Delivery: Novos (`pending`), Em Preparo (`confirmed`,`preparing`), Pronto (`ready`), Saiu para Entrega (`delivering`).
  - Retirada: Novos (`pending`), Em Preparo (`confirmed`,`preparing`), Pronto para Retirar (`ready`).
- Layout: `flex` horizontal com colunas largura `w-[280px]` + `overflow-x-auto` + uma coluna lateral fixa "Concluídos" à direita (`w-[260px]`).
- Filtrar pedidos pelo `order_type` selecionado antes de distribuir nas colunas.
- Coluna Concluídos: lista compacta dos últimos 20 (`status==="completed"` do dia), `ScrollArea` própria, item compacto (#número, cliente, total, hora). Inclui `<Input type="date">` para filtro de data (default hoje) — refiltra `completed_at`/`delivered_at`.

### 4. `src/components/delivery/OrderCard.tsx` (refatorar)
- Adicionar:
  - Número grande (`text-base font-bold`) com `#` destacado.
  - Tempo decorrido com cor progressiva: verde (<15min) `text-green-600`, amarelo (<30min) `text-yellow-600`, vermelho (≥30min) `text-red-600`. Atualizar via `useEffect` com setInterval(30s) que apenas força re-render (state `tick`).
  - Badge tipo: 🛵 Delivery / 🏪 Retirada (texto + ícone) — variantes diferentes.
  - Para `order_type==="delivery"`: linha do entregador. Buscar via `useDeliveryDrivers().drivers` (via id `order.driver_id`). Se sem driver e status em `["ready","delivering"]`: botão "Atribuir entregador" → abre um pequeno popover com lista de entregadores `disponivel` (`useAssignDriver().assignDriver`). Se já atribuído: mostra nome + ícone.
  - Para `order_type==="pickup"`: telefone clicável (`tel:` + WhatsApp icon).
  - Botão principal "Avançar" (chama `useUpdateOrderStatus` com próximo status conforme `statusFlow`) e botão "Detalhes" (abre `OrderDetailDialog`).
- Indicadores de urgência:
  - `status==="pending"` e `>5min`: classe `ring-2 ring-destructive animate-pulse`.
  - `status==="ready"` e `>10min`: `ring-2 ring-yellow-500`.

### 5. Pequeno helper `src/components/delivery/AssignDriverPopover.tsx` (criar)
- Popover/Dropdown listando drivers `is_active && status==="disponivel"` com avatar + nome. Usa `useAssignDriver().assignDriver({orderId, driverId})`. Se nenhum driver cadastrado: mostra link "Cadastrar entregador" para `/pdv/delivery/entregadores`.

## Notas técnicas
- Sem migrations: tabela `delivery_drivers` e colunas `driver_id`/`driver_assigned_at` em `delivery_orders` já existem.
- Usar apenas tokens do sistema (bg-card, bg-muted, text-foreground, ring-destructive, primary). Cores semafóricas verde/amarelo/vermelho permitidas exclusivamente no timer e bordas de urgência (semântica de status, não decoração).
- Mantém `formatBRL`, locale `ptBR` em `formatDistanceToNow`.
- Coluna Concluídos dispensa o tipo "completed" das colunas dinâmicas.

## Resultado esperado
- Toggle Delivery (N) / Retirada (N) controla cards e kanban.
- Kanban dedicado por tipo, Concluídos como side-list com filtro de data.
- Cards mostram urgência por cor/borda em tempo real e permitem atribuir entregador in-card.