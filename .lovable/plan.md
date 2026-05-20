## Reformulação da página de Relatórios do Delivery

Mantém 100% das seções e visual atuais; apenas evolui, enriquece e adiciona conteúdo.

### 1. Barra de ações no topo
- Toolbar acima do card "Período de Análise" com:
  - Título "Relatórios" + subtítulo do período selecionado.
  - Botão **Exportar relatório** com dropdown: PDF (jsPDF + autotable, captura dos cards + tabelas) e CSV (Blob/Papaparse) cobrindo: indicadores, evolução de vendas, top produtos, funil, horários de pico e bairros.

### 2. Indicadores do topo (DeliveryMetrics)
- Hook `useDeliveryMetrics` passa a calcular também:
  - `cancellationRate` = cancelados / total
  - `avgDeliveryTimeMin` = média de `delivered_at - created_at` (apenas status `delivered`)
- Novo hook `useDeliveryMetricsComparison` busca o período anterior do mesmo tamanho e devolve `% delta` para cada KPI.
- Cada card vira clicável (`<a href="#section-id">` com scroll suave) e mostra badge `+X% vs período anterior` com ícone `ArrowUp/ArrowDown` (verde/vermelho). Para taxas onde "menor é melhor" (cancelamento, tempo de entrega) a cor inverte.
- Novos cards: **Taxa de Cancelamento** e **Tempo médio de entrega** (Ticket Médio já existe).

### 3. Evolução de Vendas (SalesChart)
- `useDailySales` passa a retornar também `averageTicket` por dia.
- Toggle (ToggleGroup) com 3 opções: Pedidos · Receita · Ticket Médio — troca a métrica plotada.
- `ReferenceLine` (recharts) com a média do período da métrica selecionada.
- Tooltip customizado mostrando: data formatada pt-BR, pedidos, receita (formatBRL) e ticket médio.

### 4. Análise de Pedidos (status / tipo)
- Substituir Pie por **Donut** (`innerRadius`) com `Legend` à direita; labels com `nº absoluto + (xx%)` em cada fatia usando `LabelList` ou label custom.
- Manter paleta de tokens semânticos do design system.

### 5. Top Produtos
- `useTopProducts` adiciona `category` e `revenueShare` (% sobre revenue total dos itens).
- Adicionar `Select` de **filtro por categoria** no header da tabela.
- Coluna **Quantidade** ganha barra de progresso (`Progress`) relativa ao maior vendido.
- Nova coluna **% Receita** (revenueShare formatado).
- Linha clicável abre `Collapsible`/`Sheet` lateral mostrando mini gráfico de evolução diária daquele produto (novo hook `useProductDailySales(productId, range)`).

### 6. Funil de Compra
- Mantido. Abaixo de cada taxa, texto `text-xs text-muted-foreground` com benchmark de referência:
  - Visitas→Carrinho: 25–35%
  - Carrinho→Checkout: 60–75%
  - Checkout→Pedido: 70–85%
- Badge sutil verde/amarelo/vermelho comparando taxa real ao intervalo saudável.

### 7. Nova seção: Horários de Pico
- Novo hook `usePeakHours` agrupa pedidos por `dia da semana × hora`.
- Componente **PeakHoursHeatmap** com grade 7×24 (dias na vertical, horas na horizontal). Cor da célula varia por intensidade (`bg-primary/N`). Tooltip mostra dia, faixa horária e total de pedidos.
- Abaixo, gráfico de barras compacto com total por hora do dia (visão consolidada).

### 8. Nova seção: Desempenho por Bairro/Região
- Novo hook `useNeighborhoodPerformance` lê endereços de `delivery_orders` (campo de bairro do address já gravado; usar fallback de extração se necessário).
- Tabela com colunas: Bairro · Pedidos · Receita · Ticket Médio · Taxa de Cancelamento · % do total.
- Top 10 bairros com `Progress` na coluna de pedidos. Estado vazio amigável quando não houver bairro nos endereços.

### 9. Wiring e refator
- `ReportsTab.tsx` recebe `id`s nas seções (`#kpis`, `#sales`, `#orders-analysis`, `#top-products`, `#funnel`, `#peak-hours`, `#neighborhoods`) e novo `<ReportsToolbar>` com botão de exportação.
- Sem novas tabelas no banco — todas as métricas derivam de `delivery_orders` / `delivery_order_items` já existentes.
- Identidade visual preservada: tokens semânticos (`bg-card`, `text-foreground`, etc.), formatBRL, locale pt-BR.

### Arquivos
**Novos**
- `src/components/delivery/reports/ReportsToolbar.tsx`
- `src/components/delivery/reports/PeakHoursHeatmap.tsx`
- `src/components/delivery/reports/NeighborhoodPerformance.tsx`
- `src/components/delivery/reports/ProductSalesDrawer.tsx`
- `src/hooks/use-delivery-metrics-comparison.ts`
- `src/hooks/use-peak-hours.ts`
- `src/hooks/use-neighborhood-performance.ts`
- `src/hooks/use-product-daily-sales.ts`
- `src/lib/reports-export.ts` (PDF + CSV)

**Editados**
- `src/components/delivery/ReportsTab.tsx`
- `src/components/delivery/reports/DeliveryMetrics.tsx`
- `src/components/delivery/reports/SalesChart.tsx`
- `src/components/delivery/reports/OrdersAnalysis.tsx`
- `src/components/delivery/reports/TopProducts.tsx`
- `src/components/delivery/reports/PurchaseFunnel.tsx`
- `src/hooks/use-delivery-reports.ts` (acrescentar campos a métricas, daily sales e top products)
