## Objetivo

Fazer o painel de Tarefas (`/pdv/tarefas` → aba **Painel**) atualizar em tempo real para gerentes e proprietários, e impedir que o painel continue exibindo o dia anterior quando a página é deixada aberta durante a virada de dia.

## Diagnóstico

Dois problemas independentes causam o sintoma:

1. **Data "presa" no dia anterior.** Em `src/components/pdv/checklists/DashboardPanel.tsx` o estado `date` é inicializado uma única vez com `toLocalDateStr()` no mount. Se o usuário deixar o navegador aberto durante a noite, o painel continua consultando ontem mesmo após a virada — e como as `queryKey` dependem dessa data, nada se atualiza para "hoje".
2. **Atualização só por polling de 30 s** em `src/hooks/use-checklist-dashboard.ts`. Quando um operador conclui/inicia uma tarefa, o gerente espera até 30 s para ver. Não é "tempo real".

## Mudanças

### 1. `src/components/pdv/checklists/DashboardPanel.tsx` — auto-rollover de data
- Adicionar um `useEffect` que, a cada 60 s **e** em `visibilitychange` / `focus`, recalcula `toLocalDateStr()` e:
  - se o usuário ainda está no dia atual (o input não foi alterado manualmente para uma data passada), avança o `date` automaticamente para o novo dia.
  - implementação: manter um ref `lastAutoDate` para distinguir "o usuário escolheu manualmente outra data" de "estamos no modo hoje". Se `date === lastAutoDate` e `toLocalDateStr()` mudou, atualiza ambos.

### 2. `src/hooks/use-checklist-dashboard.ts` — Realtime via Supabase
- Adicionar um `useEffect` que abre um channel Supabase Realtime escutando `postgres_changes` em `checklist_executions` filtrado por `user_id=eq.{visibleUserId}`, e em qualquer INSERT/UPDATE/DELETE invalida as queries:
  - `checklist-dashboard-metrics`
  - `checklist-critical-tasks`
  - `checklist-timeline`
  - `checklist-completion-chart`
  - `checklist-shift-comparison`
  - `checklist-team-highlights`
- Cleanup com `supabase.removeChannel(...)` no unmount.
- Manter `refetchInterval: 30000` apenas como fallback (sem alterar).

### 3. Habilitar Realtime na tabela (migration)
Garantir que `checklist_executions` está em `supabase_realtime` e com `REPLICA IDENTITY FULL`:

```sql
ALTER TABLE public.checklist_executions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_executions;
```
(Se já estiverem, o `ADD TABLE` falha silenciosamente — envolver com `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.)

## Fora de escopo
- Não alterar `OperationalReport` (Relatório Geral) — já usa filtro de range explícito; o problema só afeta o "Painel".
- Não mexer na geração diária (`generateDaily`) nem nos views públicos de execução do operador.

## Resultado
- Painel rola sozinho para o novo dia à meia-noite (ou quando o usuário volta à aba).
- Conclusão/início de checklist por um operador aparece para o gerente em ~1 s, sem esperar o ciclo de 30 s.
