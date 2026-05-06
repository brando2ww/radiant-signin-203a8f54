## Objetivo
Remover a coluna "Confirmados" do Kanban de delivery e fazer com que ao confirmar um pedido (status `confirmed`) ele já apareça na coluna "Preparando".

## Mudanças

### 1. `src/components/delivery/OrdersKanban.tsx`
- Remover a coluna `confirmed`.
- Trocar mapeamento de status por coluna para suportar múltiplos status. A coluna "Preparando" passa a englobar `confirmed` + `preparing`.
- Colunas finais: Novos (`pending`), Preparando (`confirmed`+`preparing`), Prontos (`ready`), Saiu para Entrega (`delivering`), Concluídos (`completed`).
- Ajustar grid de `xl:grid-cols-6` para `xl:grid-cols-5`.

### 2. `src/components/delivery/OrderDetailDialog.tsx`
- Atualizar `statusFlow`: `pending → preparing` (pula `confirmed`); restante igual.
- Atualizar `statusLabels.pending` para `"Confirmar e Iniciar Preparo"`.
- Manter `confirmed → preparing` no mapa para casos legados (pedidos antigos já em `confirmed` continuam funcionando com botão "Iniciar Preparo").

### Não alterar
- Hook `useUpdateOrderStatus`: já aciona `consume_ingredients_for_delivery_order` e impressão quando o status vira `confirmed`. Como agora pulamos direto para `preparing`, precisamos garantir que estoque/print continuem disparando.
  - Acrescentar gatilho em `useUpdateOrderStatus`: quando `status === "preparing"` e o pedido vinha de `pending`, executar mesma rotina (consume ingredients + dispatchDeliveryPrintJobs + setar `confirmed_at`).
  - Para evitar duplicidade, só dispara se `confirmed_at` ainda for null no registro recém-atualizado (já obtido em `data`).

### 3. `src/hooks/use-delivery-orders.ts`
- Em `useUpdateOrderStatus.mutationFn`, quando `status === "preparing"`:
  - Se `data.confirmed_at` for null, setar `confirmed_at = now()` (update extra) e rodar `consume_ingredients_for_delivery_order` + `dispatchDeliveryPrintJobs`.
- Manter bloco existente para `status === "confirmed"` (compatibilidade legada).

## Fora do escopo
- Auto-accept (`auto_accept_orders`) continua marcando `confirmed` no realtime — pedidos auto-aceitos aparecerão na coluna "Preparando" automaticamente pelo novo agrupamento; sem mudança necessária.
- Sem alterações no banco.

## Arquivos afetados
- `src/components/delivery/OrdersKanban.tsx`
- `src/components/delivery/OrderDetailDialog.tsx`
- `src/hooks/use-delivery-orders.ts`
