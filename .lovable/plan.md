## Problema

Em `/pdv/relatorios?tab=monthly`, na tabela "Detalhe por mês", as colunas **YoY Receita** e **YoY Pedidos** ficam todas com `—` (e o card "vs 2025" mostra `0.0%`). 

## Causa

O cálculo de YoY divide pelo valor do ano anterior:
- `yoyRevenue = (cur - prev) / prev` (só calcula se `prev > 0`)
- A UI exibe `—` sempre que `prevRevenue === 0` ou `prevOrders === 0`.

Como o estabelecimento só tem dados a partir de 2026, **2025 não tem nenhum movimento** — daí todas as linhas caem no fallback "—". Não há bug de query, é falta de base comparativa.

## Correção (UX)

Editar apenas `src/pages/pdv/reports/MonthlyReport.tsx` para mostrar informação útil em vez de `—` quando não há ano-anterior:

1. Nas células de YoY Receita / YoY Pedidos da tabela:
   - Se `prev > 0` → manter `+12.3%` / `-4.5%` como hoje.
   - Se `prev === 0` e `cur > 0` → exibir `Novo` (badge sutil em `text-muted-foreground`), indicando que é mês inédito sem comparativo.
   - Se `prev === 0` e `cur === 0` → manter `—`.
2. No KPI "vs {year-1}" (topo): se `totalPrev === 0`, trocar o valor de `0.0%` por `Sem dados de {year - 1}` em `text-sm text-muted-foreground` (mesmo card).
3. Adicionar uma nota discreta abaixo do cabeçalho da tabela quando **todo** o ano anterior estiver zerado:
   `Sem histórico de {year - 1} para comparação.` (texto pequeno, `text-xs text-muted-foreground`).

Sem mudanças em query, exportação XLSX, gráficos ou outros relatórios.

## Validação

Recarregar `/pdv/relatorios?tab=monthly` no ano 2026: meses com receita (Abr, Mai) passam a mostrar `Novo` nas colunas YoY; meses zerados continuam com `—`; o KPI no topo passa a mostrar "Sem dados de 2025". Trocar para 2025 ou anos com base histórica volta a exibir percentuais reais.
