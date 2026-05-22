## Diagnóstico

Investiguei o banco do tenant atual e o problema é estrutural, não específico da Visão Geral:

- `pdv_orders.total` → **sempre 0** (216/216 pedidos fechados em maio com total=0)
- `pdv_orders.subtotal` → **sempre 0** (216/216)
- `pdv_orders.closed_at` → **NULL em 207/216** pedidos
- `pdv_order_items` → **vazio** para esses pedidos (0 registros)

A receita real está em duas outras tabelas:

- **`pdv_payments.amount`** → R$ 16.881,49 em maio (116 pagamentos). É o "dinheiro que entrou".
- **`pdv_comanda_items`** (via `pdv_comandas.order_id → pdv_orders.id`) → 1.967 itens, R$ 67.310,80 em itens consumidos. É o "que foi vendido".

Os relatórios atuais leem de `pdv_orders.total` / `pdv_order_items`, por isso aparecem como zero. O gráfico de "Formas de Pagamento" funciona porque usa outra fonte (`pdv_cashier_movements`).

Também: o filtro por período usa às vezes `opened_at`, às vezes `closed_at`, às vezes `created_at` — inconsistente. Com `closed_at` quase sempre nulo, qualquer query baseada nele perde dados.

## Proposta

Padronizar a camada de dados de relatórios em **uma única fonte de verdade** e reescrever as queries:

### 1. Nova camada compartilhada (`src/lib/reports-data-source.ts`)
- `fetchRevenueByPeriod(userId, start, end)` → consulta `pdv_payments` agregada por `processed_at`, retornando: total bruto, total por método, total por dia, total por hora, líquido (descontando `fee_amount`).
- `fetchOrdersByPeriod(userId, start, end)` → consulta `pdv_orders` + agregado de `pdv_comanda_items` (via join `pdv_comandas`) para obter receita por pedido, total de itens, descontos. Filtro de período usa `COALESCE(closed_at, opened_at)`.
- `fetchItemsByPeriod(userId, start, end)` → `pdv_comanda_items` joinado com `pdv_comandas → pdv_orders`, devolvendo product_id, product_name, quantity, subtotal, hora de consumo.
- `fetchCancellationsByPeriod` → mantém `pdv_orders` mas calcula valor cancelado via soma de `pdv_comanda_items` dos pedidos cancelados.

Cada função retorna estruturas tipadas e já corrige o problema de `total=0`.

### 2. Refatorar `usePDVReports` (`src/hooks/use-pdv-reports.ts`)
- `salesReport.totalSales` → `sum(pdv_payments.amount)` no período
- `salesReport.totalOrders` → contagem distinta de `order_id` em `pdv_payments` (ou pedidos com pelo menos 1 item)
- `salesReport.averageTicket` → totalSales / totalOrders
- `productReport` → agrupa `pdv_comanda_items` por `product_name`
- `hourlyReport` → agrupa `pdv_payments` por hora de `processed_at`
- `paymentReport` → continua via `pdv_cashier_movements` (já funciona)

### 3. Atualizar os 7 sub-relatórios para consumir a nova camada
Cada arquivo abaixo passa a chamar `fetchRevenueByPeriod` / `fetchItemsByPeriod` em vez de ler `pdv_orders.total`:

- `OverviewReport.tsx` — receita, ticket, dia da semana, top clientes, top categorias
- `ByCategoryReport.tsx` — receita por categoria via items
- `ByUserReport.tsx` — receita por operador via `pdv_payments.processed_by`
- `CancellationsReport.tsx` — valor cancelado via items dos pedidos cancelados
- `DiscountsReport.tsx` — descontos via `pdv_orders.discount` somado dos pedidos com items
- `MonthlyReport.tsx` — série mensal via `pdv_payments` agrupado por mês
- `ProductsAnalyticsReport.tsx` — já usa items, validar consistência

### 4. Period-over-period
O helper `previousPeriod` continua válido. As funções de delta passam a comparar receita-de-payments do período atual vs anterior, não mais `orders.total`.

### 5. Validação manual após implementar
Tabela de checagem para o tenant `d9087102-…` em maio/2026:

| Métrica | Esperado |
|---|---|
| Receita (Visão Geral) | ≈ R$ 16.881,49 |
| Total de pedidos | ≈ 116 distintos |
| Itens vendidos | ≈ 1.967 |

## Arquivos a editar

- **Novo:** `src/lib/reports-data-source.ts`
- **Reescrito:** `src/hooks/use-pdv-reports.ts`
- **Ajustados:** `src/pages/pdv/reports/OverviewReport.tsx`, `ByCategoryReport.tsx`, `ByUserReport.tsx`, `CancellationsReport.tsx`, `DiscountsReport.tsx`, `MonthlyReport.tsx`, `ProductsAnalyticsReport.tsx`

`PurchasesReport.tsx` não é afetado (usa `pdv_purchase_orders`, fonte diferente).

## Observação

Antes de codar: confirmar se concorda que **a receita correta é `pdv_payments.amount`** (dinheiro efetivamente recebido). A alternativa seria usar `sum(pdv_comanda_items.subtotal)` (consumo bruto), que dá R$ 67k vs R$ 16k — números muito diferentes, com significados diferentes (consumido vs pago). Em PDVs costuma-se reportar **receita = pagamentos liquidados**, mas posso usar a outra base se preferir.
