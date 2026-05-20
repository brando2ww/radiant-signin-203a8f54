## Problema

Hoje cada motoboy só consegue receber **um pedido por vez**. A lógica atual:

1. `DeliveryQueueCard` só lista motoboys com `status = "disponivel"`, então quem está em rota some do select.
2. `useAssignDriver` marca o motoboy como `em_entrega` e grava `current_order_id` com o pedido único.
3. `releaseDriverForOrder` libera o motoboy assim que **qualquer** pedido é finalizado, mesmo que ele ainda tenha outros em rota.
4. A tela de Entregadores e as stats mostram só "1 pedido em rota" porque o modelo assume 1:1.

O cliente quer que cada motoboy possa receber **pedidos ilimitados em paralelo**.

## Solução

Tornar o vínculo motoboy↔pedido um relacionamento N (sem trocar schema — o `driver_id` no pedido já é a fonte da verdade; `current_order_id` e `status` no `delivery_drivers` viram derivados/cosméticos).

### Mudanças

**1. `src/components/pdv/cashier/DeliveryQueueCard.tsx`**
- Remover o filtro por `status === "disponivel"` no `availableDrivers`. Listar todos os motoboys ativos, mostrando ao lado do nome a contagem de entregas em andamento (ex.: "🛵 Marcelo · 2 em rota") para o operador ter contexto.

**2. `src/hooks/use-delivery-drivers.ts`**
- `useAssignDriver.assign`: **não** sobrescrever `current_order_id`/`status` do motoboy de forma destrutiva. Apenas garantir `status = "em_entrega"` (mantendo `current_order_id` apenas como referência ao último atribuído, opcional). Permitir atribuir mesmo quando já está em rota.
- `useAssignDriver.unassign`: ao desatribuir um pedido, verificar se restam outros pedidos com `status = "delivering"` e `driver_id` desse motoboy. Se sim, manter `em_entrega`; se não, voltar para `disponivel` e limpar `current_order_id`.
- `releaseDriverForOrder(orderId)`: mesma lógica — só liberar o motoboy (status `disponivel`, `current_order_id = null`) quando não houver mais nenhum pedido em rota para ele. Caso contrário, apenas atualizar `current_order_id` para o próximo pedido pendente (ou deixar como está).
- `statsQuery`: passar a expor `activeOrders[driverId]` como **lista** (`{id, order_number}[]`) em vez de objeto único, e calcular contagem.

**3. `src/hooks/use-delivery-drivers.ts` → `DriverWithStats`**
- Trocar `current_order_number?: string | null` por `active_orders: { id: string; order_number: string }[]` e adicionar `active_count: number`.

**4. `src/pages/pdv/delivery/Drivers.tsx`**
- No card do motoboy, no lugar do badge "Pedido #X — Em rota", mostrar "N pedidos em rota" quando `active_count > 0`, com tooltip listando os números. Card continua usando `status` para a cor (em_entrega/disponivel).

### Pontos que **não** mudam

- Schema do banco (sem migração).
- Fluxo de pagamento, fechamento de caixa, RLS.
- Tela do entregador no app/garçom (se existir, segue lendo `driver_id` por pedido).

### Teste manual

1. Cadastre 1 motoboy.
2. Crie 3 pedidos de delivery, atribua todos ao mesmo motoboy → o select deve continuar mostrando o motoboy nos 3 cards, e cada card mostra "🛵 Nome".
3. Marque o pedido 1 como entregue → motoboy continua `em_entrega` (ainda tem 2 ativos).
4. Marque os outros dois → motoboy volta para `disponivel`.
5. Tela de Entregadores deve mostrar "3 pedidos em rota" enquanto durar e zerar ao fim.