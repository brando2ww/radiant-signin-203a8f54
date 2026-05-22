## Problema

Na página `/pdv/relatorios?tab=discounts` todos os KPIs financeiros aparecem zerados (Total descontos R$ 0, Pedidos com desconto 0, Desconto médio R$ 0, Maior desconto R$ 0, %s 0,0%, Ticket médio R$ 0), mas "Cupons resgatados = 5" e "Gerados no período = 231". O gráfico "Evolução diária de descontos" também fica vazio e a tabela "Descontos por usuário" e "Pedidos com desconto" não mostram nada.

## Causa raiz

O `DiscountsReport.tsx` lê descontos apenas de `pdv_orders.discount`. Verificado no banco em maio/2026:

- `pdv_orders` (238 linhas no período): **0 pedidos** com `discount > 0`, soma = R$ 0,00. Esse campo nunca é populado nesse sistema (mesma lógica do `pdv_orders.total` que já está documentada como zerada em `src/lib/reports-data-source.ts`).
- `delivery_orders`: **178 pedidos** com desconto, soma R$ 4.239,15, divididos entre cupons `KOTEN20` (R$ 3.338,92) e `KOTEN12` (R$ 900,23).
- `pdv_comandas` e `pdv_comanda_items` não têm coluna `discount`.
- `pdv_cashier_movements` tem `discount_reason` mas nenhuma linha com isso preenchido.

Ou seja, descontos comerciais só existem hoje em `delivery_orders.discount` (+ `coupon_code`). O relatório precisa ler dessa fonte.

Os "Cupons resgatados / Gerados" e "Top campanhas / prêmios" continuam vindo de `campaign_prize_wins` (que já funciona — por isso só esses números aparecem).

## Plano de correção

Reescrever apenas o `queryFn` e o cálculo de KPIs em `src/pages/pdv/reports/DiscountsReport.tsx`. Sem mexer em UI, exportação, layout, dependências externas ou outros relatórios.

### 1. Fonte dos descontos diretos

Substituir as duas consultas em `pdv_orders` por uma única consulta em `delivery_orders` filtrada pelo período e por `user_id = visibleUserId`, trazendo:
```
id, order_number, customer_name, customer_phone,
subtotal, discount, total, delivery_fee,
coupon_code, created_at, status
```
Filtros: `discount > 0`, `status not in ('cancelled','cancelado')`, `created_at` entre `start` e `end`.

Mapear para o shape já consumido pela UI/export:
- `order_number` → mantém
- `customer_name` → mantém
- `subtotal` → `delivery_orders.subtotal`
- `discount` → `delivery_orders.discount`
- `total` → `delivery_orders.total`
- `closed_at` → `created_at` (delivery orders não têm `closed_at`)
- `user_name` → "Delivery" (delivery não tem operador de caixa; mantém a coluna preenchida sem precisar de join em `profiles`)

Remover toda a lógica de `fetchPaymentsByOrderIds` / `fetchItemsByOrderIds` / `aggregateItemsByOrder` / `pdv_orders` para descontos (não são mais necessárias para esse relatório).

### 2. Receita global do período (para "% desc. / receita total")

Usar a mesma fonte canônica dos outros relatórios: `pdv_cashier_movements` (type = 'venda') já cobre salão + balcão + delivery. Manter consistência com `src/lib/reports-data-source.ts`. Filtrar por `pdv_cashier_sessions.user_id = visibleUserId` e `created_at` no período. Somar `amount` para `totalRevenue`. Remover o uso de `fetchPaymentsByOrderIds` global.

### 3. KPIs derivados

Recalcular em cima do novo `orders` (delivery com desconto):
- Total descontos = `sum(discount)`
- Pedidos com desconto = `count`
- Desconto médio = total / count
- Maior desconto = `max(discount)`
- % desc / subtotal = `sum(discount) / sum(subtotal)`
- % desc / receita total = `sum(discount) / totalRevenue` (cashier movements)
- Ticket médio (c/ desc.) = `sum(total) / count`

### 4. Evolução diária

Agrupar `orders` por `created_at.slice(0,10)` (não mais `closed_at`). Preencher `eachDay(start, end)` como antes.

### 5. "Descontos por usuário" → "Descontos por cupom"

Como delivery não tem operador individual, transformar essa seção em agregação por `coupon_code` (já populado e útil — `KOTEN20`, `KOTEN12` etc.). Renomear o card para **"Descontos por cupom"**, com colunas: Cupom, Pedidos, Desconto total, Desconto médio, Receita, % s/ receita. Atualizar `Por Usuário` da exportação para `Por Cupom` com os mesmos campos.

### 6. Tabela "Pedidos com desconto"

Trocar a coluna "Usuário" por "Cupom" (mostrar `coupon_code || "—"`). Data continua usando `created_at`.

### 7. Cupons resgatados / geração

Sem mudança — `campaign_prize_wins` já está correto.

## Arquivos afetados

- `src/pages/pdv/reports/DiscountsReport.tsx` (única edição)

## Validação

- Abrir `/pdv/relatorios?tab=discounts` com período padrão (mês atual). Esperado:
  - Total descontos ≈ R$ 4.239,15
  - Pedidos com desconto = 178
  - Maior desconto > 0
  - Gráfico de evolução diária com pontos
  - Tabela "Descontos por cupom" com `KOTEN20` e `KOTEN12`
  - Tabela "Pedidos com desconto" listando até 100 entradas com coluna Cupom
- Exportar Excel e conferir abas Resumo / Descontos Diretos / Por Cupom / Evolução Diária / Cupons Resgatados / Por Campanha sem erros.
