## Objetivo

Hoje cada sub-relatório do hub `/pdv/relatorios` mostra basicamente 3–4 KPIs + uma tabela. Faltam comparativos, evoluções, segmentações e cortes adicionais que um gestor precisa para tomar decisão. Vou enriquecer cada página com novos KPIs, gráficos e tabelas, mantendo o layout atual (sidebar + ReportPageHeader + ReportDateFilter + export XLSX).

A página **Produtos** (`sales-by-product`) já foi reformulada com 12 abas — não entra neste plano.

---

## 1. Visão Geral (`OverviewReport.tsx`)

**Adicionar:**
- KPIs extras: itens vendidos no período, média de itens por pedido, % desconto médio, % cancelamento, ticket médio vs período anterior (Δ%).
- Comparativo automático com período anterior equivalente (mesma quantidade de dias antes) — chip "vs período anterior" em cada KPI.
- Card "Dia da semana" — barras com receita média por dia (Seg–Dom) para identificar pico.
- Card "Top 5 clientes" — ranking por receita (a partir de `pdv_orders.customer_id/customer_name`).
- Card "Top 3 categorias" abaixo dos pagamentos.
- Atualizar XLSX com abas extras: "Dia da semana", "Top clientes".

## 2. Mensal / YoY (`MonthlyReport.tsx`)

**Adicionar:**
- KPI "Melhor mês" e "Pior mês" do ano selecionado.
- Linha de tendência (line chart) acumulado YTD vs ano anterior.
- Coluna "Itens vendidos" e "Δ pedidos YoY" na tabela.
- Card "Sazonalidade" — média móvel de 3 meses.
- Toggle entre Receita | Pedidos | Ticket médio no gráfico principal.

## 3. Categorias (`ByCategoryReport.tsx`)

**Adicionar:**
- KPIs: ticket médio por categoria (top), categoria em crescimento (vs período anterior).
- Coluna na tabela: ticket médio (receita/qtd), preço médio, Δ% vs período anterior.
- Gráfico de barras horizontal "Receita por categoria" (substitui pizza quando >5 categorias).
- Drill-down: ao clicar em uma categoria, expande os 5 produtos top dessa categoria.
- Evolução temporal — line chart das 5 maiores categorias no período (agregado por dia/semana automático).

## 4. Por Usuário (`ByUserReport.tsx`)

**Adicionar:**
- KPIs: vendedor com maior ticket médio, vendedor com mais cancelamentos, vendedor com mais descontos concedidos.
- Colunas extras na tabela: itens vendidos, % desconto sobre receita, % cancelamento, mix de pagamento principal (ex.: "60% Pix").
- Card "Ranking de receita" (bar chart horizontal).
- Card "Mix por usuário" — % do total que cada usuário representa (pizza/donut).
- Card "Horários de operação" — primeira/última venda média por usuário.

## 5. Cancelamentos (`CancellationsReport.tsx`)

**Adicionar:**
- KPIs: ticket médio cancelado, tempo médio entre abertura e cancelamento, usuário que mais cancela.
- Gráfico "Cancelamentos por dia" (line/bar) no período.
- Card "Por usuário" — tabela qtd, valor, % do total.
- Card "Itens cancelados" — top 10 produtos mais presentes em pedidos cancelados (join `pdv_order_items`).
- Filtro por motivo (multi-select) sobre a tabela detalhada.

## 6. Descontos e Cupons (`DiscountsReport.tsx`) ← página da imagem

**Adicionar:**
- KPIs: desconto médio por pedido, % desconto médio sobre subtotal, maior desconto único, total economizado pelos clientes via cupom.
- Card "Descontos por usuário" — quem mais concedeu desconto (qtd + valor + % sobre suas vendas).
- Card "Evolução diária" — linha de desconto/dia no período.
- Card "Taxa de resgate de cupons" — comparar cupons gerados (`campaign_prize_wins` total no período) vs resgatados; tempo médio entre geração e resgate.
- Card "Top campanhas/prêmios" — agrupamento por `campaign_name` e `prize_name` com qtd resgatada.
- Tornar visível a coluna **Campanha** corretamente (hoje aparece "—" porque a query busca apenas `evaluation_campaigns`; também buscar `marketing_campaigns` se existir — verificar em build).
- XLSX: adicionar abas "Por usuário", "Por campanha", "Evolução diária".

## 7. Compras (`PurchasesReport.tsx`)

**Adicionar:**
- KPIs: ticket médio por OC, % frete sobre total, ordens pendentes (status ≠ recebida), % entrega no prazo.
- Card "Evolução mensal de compras" — bar chart por mês.
- Coluna "Variação de preço" no Por Insumo — comparar preço médio atual vs período anterior (alerta visual se >10%).
- Card "Atrasos" — ordens com `expected_delivery < actual_delivery` ou pendentes vencidas.
- Card "Concentração" — % das compras nos top 3 fornecedores.

---

## Considerações técnicas

- Reutilizar `ReportDateFilter`, `ReportPageHeader`, `exportToXlsx`, `formatBRL/formatBRLCompact`, `useEstablishmentId`.
- Manter design system (sem cores customizadas — `hsl(var(--primary))`, `bg-card`, `text-muted-foreground`).
- Para "período anterior", calcular `prevStart/prevEnd` com mesma duração imediatamente antes de `startDate`.
- Gráficos com `recharts` (já em uso). Locale ptBR via `date-fns/locale`.
- Cada página continua com 1 `useQuery` principal — adicionar queries auxiliares (período anterior, dimensões extras) compostas em paralelo via `Promise.all`.
- Tabelas longas: limitar a top 20–50 com nota "…e mais N" + export XLSX completo.

## Ordem de implementação sugerida

1. Descontos e Cupons (página onde o usuário está reclamando agora)
2. Cancelamentos
3. Por Usuário
4. Categorias
5. Compras
6. Visão Geral
7. Mensal / YoY

Posso entregar tudo num único build ou ir uma a uma — me diga sua preferência ao aprovar.
