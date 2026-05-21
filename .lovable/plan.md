## Objetivo

Ao clicar no card **Total de Respostas** no dashboard de avaliações, abrir um modal com todas as respostas, ordenadas da última para a primeira (mais recente primeiro), em vez de navegar para a página de relatórios por pergunta.

## Mudanças

### 1. `src/components/evaluations/dashboard/DashboardKPICards.tsx`
- Trocar o `ClickableCard to="/pdv/avaliacoes/relatorios/por-pergunta"` do card "Total de Respostas" por um `Card` clicável que dispara `onNpsClick?.("all")` (o tipo de `onNpsClick` já aceita `"all"`).
- Manter exatamente a mesma aparência (hover, cursor, borda) do `ClickableCard`.

### 2. `src/components/evaluations/dashboard/NPSDetailDialog.tsx`
- No `useMemo` que produz `filtered`, ordenar a lista por data (`evaluation_date || created_at`) em ordem **decrescente** (mais recente primeiro). Isso vale para todas as categorias, mas é especialmente o que o usuário pediu para "all".

### 3. `src/pages/evaluations/EvaluationsDashboard.tsx`
- Nenhuma alteração estrutural — `onNpsClick={setNpsFilter}` já encaminha `"all"` para o `NPSDetailDialog` existente. O modal já tem suporte completo à categoria `"all"` ("Todas as Respostas").

## Resultado

Clicar em "Total de Respostas" abre o modal já existente `NPSDetailDialog` no modo "Todas as Respostas", com busca, contagem, e linhas listadas da mais recente para a mais antiga.
