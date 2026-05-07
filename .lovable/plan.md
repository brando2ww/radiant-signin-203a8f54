## 1. Cadastro de Entregadores (módulo Delivery)

### Banco de dados (migration)
- Criar enum `delivery_driver_status`: `disponivel`, `em_entrega`, `inativo`.
- Criar enum `delivery_vehicle_type`: `moto`, `bicicleta`, `carro`, `a_pe`.
- Criar tabela `public.delivery_drivers`:
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null` (dono do estabelecimento)
  - `name text not null`
  - `phone text`
  - `vehicle_type delivery_vehicle_type not null default 'moto'`
  - `plate text`
  - `avatar_url text`
  - `avatar_color text` (cor gerada para iniciais)
  - `notes text`
  - `is_active boolean not null default true`
  - `status delivery_driver_status not null default 'disponivel'`
  - `current_order_id uuid references delivery_orders(id) on delete set null`
  - `created_at`, `updated_at`
- Índice `(user_id, status)`.
- RLS: habilitada. SELECT/INSERT/UPDATE/DELETE permitidos quando `user_id = auth.uid()` ou `is_establishment_member(user_id)` (consistente com demais tabelas do delivery).
- Adicionar colunas em `public.delivery_orders`:
  - `driver_id uuid references delivery_drivers(id) on delete set null`
  - `driver_assigned_at timestamptz`
- Trigger `update_updated_at_column` em `delivery_drivers`.

### Hook `src/hooks/use-delivery-drivers.ts`
- `useDeliveryDrivers()` — lista todos os drivers do estabelecimento (via `useEstablishmentId`), com counters do dia/mês a partir de `delivery_orders` (`completed_at` no dia/mês).
- Mutations: `createDriver`, `updateDriver`, `deleteDriver` (soft via `is_active=false`), `setStatus`.
- Realtime opcional na lista.

### Página `src/pages/pdv/delivery/Drivers.tsx`
- Header: título + botão "Novo Entregador" + filtro por status (Tabs: Todos / Disponível / Em entrega / Inativo).
- Grid de cards com avatar (`Avatar` shadcn — iniciais + `avatar_color`), nome, telefone, ícone do veículo + placa, badge de status (default/secondary/outline — sem cores customizadas, conforme memory), contadores "Hoje: X · Mês: Y" e — quando `em_entrega` — chip com pedido atual (`#order_number — Em rota`).
- Click no card abre o drawer de edição. Menu "⋮" com Editar / Desativar.

### Drawer `src/components/delivery/DriverFormSheet.tsx`
- `Sheet` lateral. Form com `react-hook-form` + zod:
  - Nome (obrigatório, ≤100), Telefone (mask), Tipo de veículo (RadioGroup com ícones — `Bike`, `Bike` (bicicleta), `Car`, `Footprints`), Placa (≤10), Foto (upload via `useSupabaseUpload` para bucket `avatars` no path `{userId}/{file}`), Status ativo (Switch), Observação (textarea ≤500).
- Avatar gerado: se sem foto, gera cor determinística pelo nome.

### Roteamento e navegação
- Adicionar rota `delivery/entregadores` em `src/pages/PDV.tsx` mapeando `Drivers`.
- Adicionar item "Entregadores" (icon `Bike`) em `src/components/pdv/PDVHeaderNav.tsx`, na seção delivery (após "Pedidos").

## 2. Atribuição de entregador na Frente de Caixa

### `src/components/pdv/cashier/DeliveryQueueCard.tsx`
- Quando `order.status === "delivering"` e existir pelo menos 1 entregador cadastrado:
  - Se `order.driver_id` nulo: mostrar `Select` compacto com entregadores disponíveis (status `disponivel`). Confirmação chama mutation `assignDriver(orderId, driverId)`.
  - Se já atribuído: mostrar badge `🛵 Nome` + botão pequeno para desatribuir.
- Se nenhum entregador cadastrado, esconder o seletor (mantém fluxo atual).

### Mutation `assignDriver` (em `use-delivery-drivers.ts`)
- Update em `delivery_orders` (`driver_id`, `driver_assigned_at=now()`) **e** em `delivery_drivers` (`status='em_entrega'`, `current_order_id=orderId`). Em paralelo via `Promise.all`.
- `unassignDriver`: limpa ambos.
- Invalida queries: `pdv-delivery-queue`, `delivery-drivers`, `delivery-orders`.

### Liberação automática ao confirmar pagamento / conclusão
- Em `src/hooks/use-pdv-delivery-checkout.ts` (registro de pagamento) e no fluxo de "Confirmar recebimento online": após sucesso, se o pedido tinha `driver_id`, marcar driver como `disponivel` e limpar `current_order_id`. Contador do dia/mês é derivado de `delivery_orders.completed_at` (não precisa coluna extra).
- Mesmo tratamento quando o pedido vira `cancelled` enquanto havia driver atribuído.

### Tipagem
- Atualizar `DeliveryOrder` (em `use-delivery-orders.ts`) para incluir `driver_id?: string | null` e `driver_assigned_at?: string | null`. Tipos do Supabase são regenerados automaticamente.

## Regras garantidas
- Driver só aparece no select se `status = 'disponivel'` e `is_active = true`.
- Atribuição opcional — se não selecionado, status avança normalmente.
- Sem entregadores cadastrados → nenhum seletor.

## Observações de design
- Sem cores customizadas: badges via variantes default/secondary/outline (memory: usar tokens do sistema).
- Drawer segue padrões de Dialog UI (defer open, reset states ao fechar).
- Currency e datas seguem `formatBRL` e `ptBR`.