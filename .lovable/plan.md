# Fix de fuso horário no módulo de Checklists

`new Date().toISOString().split("T")[0]` retorna a data em UTC. Para o horário de Brasília (UTC-3), qualquer ação executada entre 21h e 23h59 grava/filtra com a data do dia seguinte, e tudo feito antes acaba indo para o "bucket" errado. Os timestamps `timestamptz` (`started_at`, `completed_at`, `acknowledged_at`) devem continuar em UTC — só as colunas `date` (sem fuso) precisam virar local.

## 1. Helper compartilhado

Adicionar em `src/lib/date.ts` (novo arquivo):

```ts
export function toLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

(`src/hooks/use-daily-tasks.ts` já tem esta função inline — passa a importar do novo módulo e remove a duplicata.)

## 2. Arquivos a corrigir

Substituir todas as ocorrências de `…toISOString().split("T")[0]` por `toLocalDateStr(date)` (ou `toLocalDateStr()` quando a base é `new Date()`):

**Checklists / Tasks (escopo do bug)**
- `src/hooks/use-daily-tasks.ts` — usar import.
- `src/hooks/use-checklist-execution.ts` — linhas 64 e 158 (`todayStr`).
- `src/hooks/use-checklist-dashboard.ts` — linha 18 (default `date`).
- `src/hooks/use-public-tasks.ts` — linha 7.
- `src/hooks/use-operational-tasks.ts` — linha 101.
- `src/hooks/use-operator-scores.ts` — linhas 40, 52, 57, 62, 76, 83, 91 (todos os `periodStart/periodEnd`).
- `src/components/pdv/tasks/TaskHistory.tsx` — linha 17 (`useState` da data).
- `src/components/pdv/tasks/settings/DataSection.tsx` — linhas 52, 67, 68, 78 (backup + export CSV).
- `src/components/pdv/checklists/DashboardPanel.tsx` — linha 31 (`useState` da data).
- `src/components/pdv/checklists/TeamScorePanel.tsx` — linhas 22 e 23 (`customStart/customEnd`).
- `src/pages/PublicChecklistAccess.tsx` — linha 150 (`todayStr`).

**Já corretos (sem alteração)**
- `src/hooks/use-operational-report.ts` usa `format(d, "yyyy-MM-dd")` (date-fns, local). ✓
- Timestamps `…toISOString()` para colunas `timestamptz` (`started_at`, `completed_at`, `acknowledged_at` em `use-checklist-execution.ts`, `use-public-tasks.ts`, `use-checklist-dashboard.ts`, `PublicChecklistAccess.tsx`) permanecem como estão. ✓

**Fora do escopo (não tocar nesta entrega)**: `use-customer-evaluations.ts`, `use-convert-lead.ts`, `use-transactions.ts`, `use-calendar-events.ts`, `use-bills.ts`, `use-card-transactions.ts`, `use-pdv-comandas.ts`, `use-pdv-purchase-orders.ts`, `CouponDialog.tsx` — não pertencem ao módulo de Checklists.

## 3. `dayOfWeek`

Auditado e já está correto (usa `getDay()` local):
- `use-daily-tasks.ts:111` → `new Date(\`${targetDate}T12:00:00\`).getDay()` (constrói data local com offset de meio-dia para evitar DST). ✓
- `use-checklist-execution.ts:63` → `today.getDay()` em um `Date` local. ✓
- `schedules/ScheduleWeekGrid.tsx`, `schedules/ScheduleIndicators.tsx` → `new Date().getDay()` local. ✓

Nenhuma mudança necessária aqui.

## 4. Validação

Após a entrega, validar executando checklist às 21h, 22h e 23h (horário de Brasília) e conferir:
- A linha em `checklist_executions` é gravada com `execution_date` = dia local.
- O Painel, "Relatório Geral" e Score continuam mostrando a execução no dia correto até 23h59.
- Após meia-noite local, a data avança apenas uma vez.

## Fora de escopo
Sem mudanças em RLS, schema, edge functions, ou lógica de cálculo. Apenas substituição direta de derivação de data.
