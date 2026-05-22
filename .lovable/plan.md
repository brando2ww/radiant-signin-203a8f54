## Objetivo

Página completa de **Análise de Produtos** para o gestor — não só "quanto vendeu", mas também margem, lucratividade, curva ABC, tendência, canais (salão/balcão/delivery), parados, cancelados, modificadores, kits e cobertura de estoque.

## Onde encaixa

Hoje a aba **"Vendas por Produto"** dentro do hub `/pdv/relatorios` é rasa (ranking simples). Em vez de criar uma rota nova solta, **expandir essa aba** transformando-a em uma página rica multi-seção, renomeada para **"Produtos"** na sidebar. Mantém o padrão do hub já existente (filtro de período no topo, botão único "Exportar Excel" gerando workbook com várias abas).

Arquivo principal substituído: `src/pages/pdv/reports/SalesByProductReport.tsx` → novo `ProductsAnalyticsReport.tsx`. Sub-seções organizadas em tabs internas (componente `Tabs` do shadcn).

## Estrutura da página

Cabeçalho fixo:
- Título "Análise de Produtos"
- Filtros globais: período (com atalhos), categoria (multi), origem (Salão / Balcão / Delivery), busca por nome.
- Botão **"Exportar Excel"** (gera workbook único com todas as abas).

Sub-tabs internas (em ordem):

### 1. Visão Geral
KPIs:
- Produtos vendidos (distintos)
- Quantidade total
- Receita total
- CMV total
- Lucro bruto (receita − CMV)
- Margem média (%)
- Ticket médio por item

Mais um mini-card com o "Top 1" e o "Pior margem".

### 2. Ranking
Tabela ordenável (clique no header), uma linha por produto:

| Produto | Categoria | Qtd | Receita | CMV | Lucro | Margem % | Pedidos | Ticket médio item | % Receita | Δ vs período anterior |

- Compara com período imediatamente anterior do mesmo tamanho (ex.: 30 dias atuais vs 30 dias anteriores) → coluna "Δ" mostra crescimento/queda em receita.
- Paginação leve (renderização virtual ou top 200) para evitar travar.

### 3. Curva ABC (Pareto)
- Ordena por receita decrescente, calcula receita acumulada %.
- Classifica: **A** (até 80%), **B** (80–95%), **C** (95–100%).
- Gráfico Pareto: barras (receita) + linha (acumulado %).
- Cards-resumo: quantos produtos em A/B/C, % da receita que cada faixa representa.

### 4. Margem & Lucratividade
- Top 10 mais lucrativos (lucro bruto absoluto).
- Top 10 maior margem %.
- Top 10 menor margem (alerta).
- Scatter: eixo X = qtd vendida, eixo Y = margem %, ponto = produto (mostra "vacas leiteiras" vs "abacaxis").
- Fonte de CMV: reaproveita `usePDVCmv` (recipes + composições — já corrigido).

### 5. Tendência
- Selecionar até 5 produtos (ou usar top 5 por padrão).
- Gráfico de linha: receita diária no período.
- Comparativo: mesmo período anterior.

### 6. Canais (Salão × Balcão × Delivery)
Matriz produto × canal:

| Produto | Salão (qtd / R$) | Balcão (qtd / R$) | Delivery (qtd / R$) | Total |

- Fonte: `pdv_orders.source` para salão/balcão (via `pdv_order_items`) + `delivery_order_items` JOIN `delivery_orders` (status `entregue`) para delivery.
- Permite ver produtos que vendem só num canal.

### 7. Por hora e dia da semana
- Heatmap (7 dias × 24 horas) mostrando qtd vendida (todos os produtos, ou filtrado por produto via dropdown).
- Tabela complementar: "Melhor dia" e "Melhor hora" por produto (top 20).

### 8. Produtos parados
- Lista de `pdv_products` (do tenant) que **não tiveram nenhuma venda** no período selecionado.
- Colunas: produto, categoria, preço, dias desde a última venda (consulta isolada do último `pdv_order_items.created_at`).
- Ajuda a decidir descontinuar / promover.

### 9. Itens cancelados
- Itens em pedidos cancelados (`pdv_orders.status='cancelada'`) agregados por produto: qtd cancelada, valor perdido, % sobre vendido.
- Lista detalhada (data, pedido, produto, qtd, valor, motivo do cancelamento do pedido).

### 10. Modificadores / Opcionais
- Agrega `pdv_order_items.modifiers` (jsonb) extraindo cada modificador escolhido.
- Tabela: modificador | vezes escolhido | receita extra (somando `price_adjustment`).
- Ajuda a entender opcionais populares (ex.: "adicional de bacon").

### 11. Composições / Kits
- Lista de produtos com `is_composite=true`, mostrando: qtd do kit vendida, receita do kit, e top sub-produtos contidos (via `pdv_product_compositions`).
- Útil para entender desempenho de combos.

### 12. Cobertura de estoque
- Apenas para produtos com receita (`pdv_product_recipes`).
- Calcula consumo médio de cada ingrediente por dia (com base no período) → estoque atual / consumo diário = dias de cobertura.
- Tabela: produto | ingrediente crítico | estoque atual | consumo/dia | dias restantes | status (verde / amarelo / vermelho).
- Sinaliza onde estoque vai acabar antes da próxima compra.

## Exportação Excel

Botão único gera **um workbook** com as abas:
- `Ranking`, `ABC`, `Margem`, `Canais`, `Parados`, `Cancelados`, `Modificadores`, `Kits`, `Cobertura Estoque`.
- Cada aba já formatada (R$, %, datas) via `exportToXlsx`.

## Detalhes técnicos

- Hook unificado novo: `src/hooks/reports/use-product-analytics.ts`
  - Recebe `{ start, end, source[], category[] }`.
  - Faz 1 query para `pdv_order_items` no período + 1 para `delivery_order_items` + 1 para `pdv_products` (catálogo completo do tenant) + reuso de `usePDVCmv` para CMV.
  - Retorna um objeto consolidado consumido por todas as sub-tabs (evita N consultas duplicadas).
  - Aplica memoização para classificar ABC, calcular margem, agregar por canal/hora/dia.
- Período anterior: calcula automaticamente com mesmo tamanho do filtro atual.
- Reusa: `useEstablishmentId`, `formatBRL`, `formatBRLCompact`, `ReportDateFilter`, `ReportPageHeader`, `exportToXlsx`, `usePDVCmv`.
- Sidebar do hub `Reports.tsx`: renomeia "Vendas por Produto" → **"Produtos"** com mesmo ícone (`Package`).
- Cores estritamente semânticas (memória do projeto).

## O que NÃO entra

- Devoluções/trocas (não há tabela dedicada hoje).
- Forecast / previsão de vendas com IA — fora do escopo desta entrega.
- Edição/ações em produto direto da tabela (apenas leitura; usuário usa /pdv/produtos para editar).
- Permissões granulares — herda a permissão atual de `/pdv/relatorios`.

## Ordem de implementação

1. Hook `use-product-analytics.ts` consolidado (com integração ao `usePDVCmv`).
2. Página `ProductsAnalyticsReport.tsx` com tabs vazias + Visão Geral + Ranking.
3. ABC + Margem.
4. Tendência + Canais.
5. Hora/dia + Parados.
6. Cancelados + Modificadores + Kits.
7. Cobertura de estoque.
8. Export Excel consolidado.
9. Renomeia entrada na sidebar do hub.
