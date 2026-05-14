# Correções no módulo de Checklists/Tarefas

## Bug 1 — Erro ao avaliar evidências

**Causa raiz:** `useReviewEvidence` usa `upsert(..., { onConflict: "execution_item_id" })` em `checklist_evidence_reviews`, mas a tabela não possui constraint `UNIQUE(execution_item_id)` — o upsert falha. Além disso, quando um colaborador (membro do estabelecimento) avalia, é gravado `user_id: user.id` (auth do staff), e a RLS exige `auth.uid() = user_id OR is_establishment_member(user_id)` — passando o id do staff, o `is_establishment_member` testa o staff contra ele mesmo e nega. Também `reviewer_id` nunca é preenchido.

**Migração:**
- Adicionar `UNIQUE(execution_item_id)` em `checklist_evidence_reviews`.
- Adicionar coluna `updated_at` + trigger `update_updated_at_column`.

**Código (`src/hooks/use-checklist-evidence.ts`):**
- Trocar `useAuth` por `useEstablishmentId` para usar `visibleUserId` (id do dono) no campo `user_id`.
- Adicionar `reviewer_id` resolvendo o `checklist_operators.id` do usuário logado quando existir; usar `useAuth` apenas para isso.
- Manter `upsert` com `onConflict: "execution_item_id"` (agora suportado pela constraint).

## Bug 2 — Tarefas do Dia em fuso errado e sem seletor de data

**Causa raiz em `src/hooks/use-daily-tasks.ts`:**
- `todayStr = new Date().toISOString().split("T")[0]` usa UTC; em UTC-3 isso vira o dia seguinte às 21h locais, fazendo tarefas noturnas (Fechamento 23h) caírem na data errada.
- Não há seletor de data — não é possível consultar histórico.

**Correções:**
- Criar helper `toLocalDateStr(d: Date)` que monta `YYYY-MM-DD` a partir de `getFullYear/getMonth/getDate` locais. Usar para `todayStr` e `dayOfWeek` derivados do mesmo `Date`.
- Refatorar `useDailyTasks(date?: string)` recebendo data opcional (default = hoje local). `dayOfWeek` deve vir da data selecionada (`new Date(date+"T12:00:00").getDay()`), e a query de execuções filtra por essa data.
- Em `deriveStatus`, quando a data selecionada **não for hoje**, não recalcular overdue por hora atual: para datas passadas, qualquer não concluído conta como `overdue`; para datas futuras, `pending`.
- Desabilitar o `refetchInterval` de 30s e o toast de overdue quando a data não for hoje.

**UI (`src/components/pdv/tasks/DailyTasksView.tsx`):**
- Adicionar `<Input type="date">` no topo (estado `selectedDate`), com botões "Hoje" e setas anterior/próximo dia.
- Passar `selectedDate` para `useDailyTasks(selectedDate)`.
- Esconder/desabilitar ações de "Iniciar" quando a data selecionada for passada (somente leitura/histórico).

## Bug 3 — Alerta de temperatura persiste após nova leitura dentro da faixa

**Causa raiz:** `ChecklistExecutionPage.handleSave` cria alerta em `checklist_alerts` quando `is_compliant === false`, mas quando o operador registra novo valor `is_compliant === true`, o alerta antigo continua não-reconhecido. Também o `Set alertedItems` impede reemissão sem nunca limpar.

**Correção em `src/components/pdv/checklists/execution/ChecklistExecutionPage.tsx`:**
- Após salvar com `isCompliant === true`, chamar nova função `acknowledgeAlertsForItem(executionId, savedItem.id)` que faz `UPDATE checklist_alerts SET is_acknowledged=true, acknowledged_at=now() WHERE execution_id=? AND item_id=? AND is_acknowledged=false`.
- Remover o `executionItemId` do `alertedItems` para permitir novo alerta caso volte a ficar fora da faixa depois.
- Invalidar a query de alertas (queryKey de `useChecklistAlerts`/dashboard) após o acknowledge.

**Código (`src/hooks/use-checklist-execution.ts`):** expor `acknowledgeAlertsForItem` que executa o update + invalida `["checklist-alerts"]`.

## Resumo dos arquivos alterados
- Migração SQL: `checklist_evidence_reviews` (unique + updated_at).
- `src/hooks/use-checklist-evidence.ts`
- `src/hooks/use-daily-tasks.ts`
- `src/hooks/use-checklist-execution.ts`
- `src/components/pdv/tasks/DailyTasksView.tsx`
- `src/components/pdv/checklists/execution/ChecklistExecutionPage.tsx`
