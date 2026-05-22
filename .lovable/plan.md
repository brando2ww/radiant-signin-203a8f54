## O que já existe

**Página `/pdv/relatorios`** (`src/pages/pdv/Reports.tsx`) — filtros de data + 4 blocos:
- `ReportSummaryCards` (total vendas, pedidos, ticket médio, cancelados)
- `PaymentMethodChart` (formas de pagamento)
- `ProductsTable` (vendas por produto, sem export)
- `HourlySalesChart` (vendas por hora)
- `MonthlyRevenueSection` (receita por mês — bem básico)

Hook `usePDVReports` consulta `pdv_orders`, `pdv_order_items`, `pdv_cashier_movements`, `pdv_cashier_sessions`.

**Outras seções com "relatórios" já cobertas e que NÃO entram neste escopo:**
- `/pdv/financeiro/*` — DRE, Fluxo de Caixa, CMV Geral, CMV por Produto, Demo. Caixa.
- `/pdv/delivery/relatorios` — relatórios do delivery.
- `/pdv/avaliacoes/relatorios/*` — relatórios de NPS.

**Dependências já instaladas:** `xlsx@0.18.5` ✅ (não precisa instalar nada).

**Tabelas relevantes mapeadas:** `pdv_orders` (status, total, discount, cancellation_reason, source, opened_by, closed_by_user_id, cancelled_at, closed_at, customer_id), `pdv_order_items` (product_id, product_name, quantity, subtotal), `pdv_comanda_items`, `pdv_products` (category), `pdv_purchase_orders` (supplier_id, total, status, order_date), `pdv_purchase_order_items` (ingredient_id, quantity, total_price), `pdv_ingredients`, `pdv_suppliers`, `profiles` (nome de usuários), `campaign_prize_wins` (cupons resgatados / descontos por cupom).

## O que vamos construir

Refatorar `/pdv/relatorios` em um **hub com sidebar fixa** (mesmo padrão do módulo Checklists — `mem://ui-patterns/checklists-sidebar-layout`), com 8 sub-rotas. Cada sub-rota tem filtro de período próprio, KPIs, tabela/gráfico e **botão "Exportar Excel"** no canto superior direito.

### Estrutura de rotas (em `src/pages/PDV.tsx`)

```text
/pdv/relatorios                       → redirect para /pdv/relatorios/visao-geral
/pdv/relatorios/visao-geral           → conteúdo atual (renomeado)
/pdv/relatorios/mensal                → evolução mês a mês + YoY
/pdv/relatorios/categorias            → vendas por categoria
/pdv/relatorios/usuario               → vendas por usuário/operador
/pdv/relatorios/cancelamentos         → pedidos/itens cancelados
/pdv/relatorios/descontos             → descontos aplicados e cupons
/pdv/relatorios/compras               → compras de insumos
/pdv/relatorios/vendas-por-produto    → ranking expandido
```

Layout: `src/pages/pdv/reports/ReportsLayout.tsx` (sidebar + `<Outlet />`). Sidebar usa o padrão dos Checklists.

### Utilitário de exportação Excel

`src/lib/xlsx-export.ts` — função única:

```ts
exportToXlsx(filename: string, sheets: { name: string; rows: any[]; columns?: { key: string; label: string; width?: number; type?: "currency"|"number"|"percent"|"date" }[] }[])
```

- Usa `XLSX.utils.json_to_sheet`, aplica larguras, formata BRL/datas, escreve header em negrito.
- Todos os relatórios chamam essa função.

### Detalhamento de cada relatório

#### 1. Mensal (`reports/Monthly.tsx`)
- Filtro: ano (default ano atual) + comparativo com ano anterior.
- KPIs: receita total no ano, ticket médio, total de pedidos, crescimento YoY (%).
- Gráfico de barras agrupadas: Jan..Dez (ano atual vs ano anterior).
- Tabela: mês | nº pedidos | receita | ticket médio | YoY %.
- Fonte: `pdv_orders` (status=fechada, agrupar por `date_trunc('month', closed_at)`).
- Excel: 1 aba "Mensal" + 1 aba "Comparativo Anual".

#### 2. Categorias (`reports/ByCategory.tsx`)
- Filtro: período (datas + atalhos hoje/7/30/mês).
- KPIs: nº de categorias com venda, melhor categoria, pior margem (se houver CMV).
- Gráfico pizza + tabela: categoria | qtd vendida | receita | % do total.
- Fonte: `pdv_order_items` JOIN `pdv_products(category)` filtrando pelo período de `pdv_orders.closed_at`.
- Excel: aba única com a tabela completa.

#### 3. Usuário (`reports/ByUser.tsx`)
- Filtro: período + (opcional) usuário específico.
- KPIs: total operadores ativos, top vendedor, ticket médio geral.
- Tabela: usuário | nº pedidos abertos (opened_by) | nº pedidos fechados (closed_by_user_id) | receita fechada | ticket médio | descontos concedidos | cancelados.
- Fonte: `pdv_orders` JOIN `profiles` por `opened_by` e `closed_by_user_id`.
- Excel: aba "Por Usuário" + aba "Detalhe de Pedidos".

#### 4. Cancelamentos (`reports/Cancellations.tsx`)
- Filtro: período.
- KPIs: nº cancelamentos, valor cancelado, % sobre vendas, top motivo.
- Gráfico: top motivos (`cancellation_reason`).
- Tabela: data | nº pedido | cliente | valor | motivo | usuário (closed_by) — uma linha por pedido cancelado.
- Fonte: `pdv_orders` onde `status='cancelada'` ou `cancelled_at IS NOT NULL` no período.
- Excel: aba "Cancelamentos" + aba "Resumo por motivo".

#### 5. Descontos (`reports/Discounts.tsx`)
- Filtro: período.
- KPIs: total descontos (R$), nº pedidos com desconto, ticket médio com desconto, cupons resgatados.
- Tabela 1: pedidos com `discount > 0` — data, nº pedido, cliente, subtotal, desconto, total, usuário.
- Tabela 2: cupons resgatados no período — `campaign_prize_wins` (código, cliente, prêmio, data resgate, campanha).
- Excel: 2 abas ("Descontos Diretos" + "Cupons").

#### 6. Compras (`reports/Purchases.tsx`)
- Filtro: período (sobre `order_date`) + status + fornecedor.
- KPIs: total comprado (R$), nº ordens, fornecedores ativos, frete total.
- Tabelas:
  - Por fornecedor: fornecedor | nº ordens | total | frete.
  - Por insumo: insumo | qtd comprada | preço médio | total | última compra.
  - Detalhe de ordens (linha por OC): nº | data | fornecedor | status | subtotal | desconto | frete | total | entrega prevista/efetuada.
- Fonte: `pdv_purchase_orders` + `pdv_purchase_order_items` + `pdv_suppliers` + `pdv_ingredients`.
- Excel: 3 abas (Fornecedor / Insumo / Ordens).

#### 7. Vendas por Produto (`reports/SalesByProduct.tsx`)
- Filtro: período + categoria + busca por nome.
- KPIs: produtos vendidos (distintos), produto top, receita total, qtd total.
- Tabela ordenável: produto | categoria | qtd | receita | ticket médio do item | nº pedidos distintos | % da receita.
- Gráfico: top 10 por receita (barra horizontal).
- Fonte: `pdv_order_items` JOIN `pdv_orders` (fechadas no período) JOIN `pdv_products(category)`.
- Excel: aba única, formato pronto para análise (colunas com formatação numérica/BRL).

#### 8. Visão Geral (`reports/Overview.tsx`)
- Move o conteúdo atual de `Reports.tsx` (intacto) + adiciona botão "Exportar tudo" que gera Excel com 4 abas (resumo, pagamentos, produtos, horários).

### Navegação

- Atualizar `PDVHeaderNav.tsx`: o item "Relatórios" abre um sub-menu (padrão dos demais itens) com os 8 links — OU mantém o link único `/pdv/relatorios` e a navegação interna acontece na sidebar do hub. **Decisão técnica:** manter o link único no header e usar a sidebar do hub (menos poluição no header).
- Atualizar `use-user-role.ts`: replicar as permissões de `/pdv/relatorios` para todos os filhos `/pdv/relatorios/*` (mesma regra de acesso da página atual).

### Hooks novos (em `src/hooks/reports/`)

- `use-report-monthly.ts`
- `use-report-by-category.ts`
- `use-report-by-user.ts`
- `use-report-cancellations.ts`
- `use-report-discounts.ts`
- `use-report-purchases.ts`
- `use-report-sales-by-product.ts`

Cada um expõe `data`, `isLoading` e uma função `buildExportRows()` reutilizada pelo botão de Excel.

## Detalhes técnicos (resumo)

- Escopo de tenant: usar `useEstablishmentId().visibleUserId` em todos os hooks (memória "Staff Data Visibility").
- Formatação BRL: sempre via `formatBRL` (memória "Currency").
- Datas: `date-fns` com `ptBR` (memória "Localization").
- Cores: somente tokens semânticos (memória "Color Scheme").
- Hub usa `min-h-[calc(100vh-3.5rem)]` (memória "Full Page Height").

## O que NÃO entra

- Permissões granulares por sub-relatório (mantém a permissão atual de `/pdv/relatorios`).
- Relatórios do delivery, fiscais, financeiros (DRE/Fluxo/CMV) — já existem em outros lugares.
- Agendamento/envio automático de relatórios por email/WhatsApp.

## Ordem sugerida de implementação

1. Util `xlsx-export.ts` + `ReportsLayout` + rotas.
2. Mover conteúdo atual para `Overview.tsx`.
3. Vendas por Produto, Mensal, Categorias (mais usados).
4. Usuário, Cancelamentos, Descontos.
5. Compras (depende de joins maiores).
6. Smoke-test em cada página + export Excel.
