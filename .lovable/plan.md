## Objetivo

Expandir a página `/pdv/relatorios` adicionando uma seção de **Evolução de Faturamento** com gráfico mês a mês (separado por canal: Salão, Balcão e Delivery) e cards comparativos MoM / YoY / acumulado do ano.

## Estrutura visual da nova página

```text
┌─────────────────────────────────────────────────────┐
│ 📊 Relatórios                                       │
├─────────────────────────────────────────────────────┤
│ [ Filtros de período atuais — mantidos ]            │
│ [ Cards de resumo + gráficos atuais — mantidos ]    │
├─────────────────────────────────────────────────────┤
│ 📈 Evolução de Faturamento                          │
│                                                      │
│ ┌─ Mês atual ─┐ ┌─ vs mês ant. ─┐ ┌─ vs ano ant. ─┐ │
│ │ R$ 42.300   │ │ +12,4% ▲      │ │ +28,1% ▲      │ │
│ └─────────────┘ └───────────────┘ └───────────────┘ │
│ ┌─ Acum. ano ─┐ ┌─ Acum. ano-1 ─┐ ┌─ Variação ───┐  │
│ │ R$ 312.500  │ │ R$ 244.700    │ │ +27,7% ▲     │  │
│ └─────────────┘ └───────────────┘ └──────────────┘  │
│                                                      │
│ [ Tabs: Mês a Mês | Ano vs Ano ]                    │
│                                                      │
│ Mês a Mês (últimos 24 meses):                       │
│   gráfico de barras empilhadas por canal            │
│   (Salão / Balcão / Delivery)                       │
│                                                      │
│ Ano vs Ano:                                         │
│   gráfico de linha — 2 séries                       │
│   (ano corrente vs ano anterior, jan→dez)           │
│                                                      │
│ [ Tabela detalhada exportável CSV ]                 │
└─────────────────────────────────────────────────────┘
```

## Arquivos novos

### `src/hooks/use-pdv-monthly-revenue.ts`
Hook único que retorna a evolução agregada por mês e canal para os **últimos 24 meses** (cobre comparativo YoY automático).

Forma do retorno:
```ts
{
  months: Array<{
    month: string;          // "2025-01"
    label: string;          // "jan/25"
    salao: number;
    balcao: number;
    delivery: number;
    total: number;
  }>,
  summary: {
    currentMonth: number;
    previousMonth: number;
    sameMonthLastYear: number;
    momChange: number;        // %
    yoyChange: number;        // %
    ytdCurrent: number;
    ytdPrevious: number;
    ytdChange: number;        // %
  }
}
```

Fontes de dados:
- **Salão**: `pdv_orders` onde `source = 'salao'` e `status = 'fechada'`, agregado por `date_trunc('month', closed_at)` (fallback `created_at`).
- **Balcão**: `pdv_orders` onde `source = 'balcao'` e `status = 'fechada'`.
- **Delivery**: `delivery_orders` onde `status IN ('completed','delivered')` e `payment_status = 'paid'`, agregado por `created_at`.

Implementação no client: 3 queries em paralelo limitadas aos últimos 24 meses (`gte(start_of_month_24_ago)`), agregação JS por `YYYY-MM`. Usa `useEstablishmentId` para resolver dono.

### `src/components/pdv/MonthlyRevenueSection.tsx`
- Cards com `formatBRL` e badge de variação (▲ verde / ▼ vermelho) **sem cores customizadas** — usa `text-foreground` + `text-muted-foreground` (sem violar a regra de design do projeto: variação positiva/negativa é sinalizada por ícone, não por cor saturada).
- 2 gráficos `recharts`:
  - **Mês a Mês**: `BarChart` empilhado, 24 meses, séries Salão/Balcão/Delivery em tons da paleta semântica (`hsl(var(--primary))`, `hsl(var(--muted-foreground))`, `hsl(var(--accent))`).
  - **Ano vs Ano**: `LineChart` com 2 séries (ano corrente, ano anterior) eixo X jan→dez.
- Tabela colapsável com botão **"Exportar CSV"** (reutiliza `src/lib/export-utils.ts` se houver helper, senão geração inline).

## Arquivo modificado

### `src/pages/pdv/Reports.tsx`
- Mantém todo o conteúdo atual (filtros, `ReportSummaryCards`, `PaymentMethodChart`, `ProductsTable`, `HourlySalesChart`).
- Adiciona `<MonthlyRevenueSection />` ao final, fora do filtro de período (sempre últimos 24 meses, independente do filtro acima).
- Pequeno separador visual + título "Evolução de Faturamento".

## Detalhes técnicos

- **Localização**: nomes de meses via `format(date, "LLL/yy", { locale: ptBR })` → "jan/25".
- **Acessibilidade dos gráficos**: `<Tooltip formatter={formatBRL}>` para valores legíveis.
- **Loading**: skeleton dentro da seção, sem bloquear o resto da página.
- **Performance**: queries com `select` apenas das colunas necessárias (`total, source, status, closed_at, created_at`) — limite teórico de 1000 linhas por query do Supabase é suficiente em 24 meses para a grande maioria dos estabelecimentos; adicionar paginação manual (`range`) se algum tenant ultrapassar — incluir no hook desde já um loop paginado defensivo de 1000 em 1000.
- **RBAC**: a rota `/pdv/relatorios` já está protegida por `RoleRoute`; nada novo.

## Fora de escopo

- Projeções/forecast (sazonalidade, médias móveis preditivas).
- Drill-down clicando no mês para ver o relatório daquele mês (pode ser adicionado em iteração futura).
- Filtro para escolher o número de meses (24 fixo é suficiente para mostrar YoY completo).
