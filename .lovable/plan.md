# Relatório Operacional — substituir "Tarefas do Dia"

A aba **Tarefas do Dia** (sidebar de Checklists Operacionais → `case "hoje"` em `src/pages/pdv/Tasks.tsx`) passa a renderizar um novo painel de relatório geral. O conteúdo atual (`DailyTasksView`) é totalmente substituído. `DailyTasksView.tsx` permanece como arquivo histórico (não importado).

## Filtros (topo, sticky)

### Seletor de período — estilo da referência enviada
Botão principal mostra `📅 <preset>: <data inicial> a <data final>`. Ao clicar abre `Popover` largo (≈900px) com:

- **Coluna esquerda — lista de presets em radio**:
  - Grupo "Usados recentemente" (até 3 últimos, persistidos em `localStorage`).
  - Separador.
  - Presets fixos: Hoje, Ontem, Hoje e ontem, Últimos 7 dias, Últimos 14 dias, Últimos 28 dias, Últimos 30 dias, Esta semana, Semana passada, Este mês, Mês passado, Máximo, Personalizado.
- **Direita — calendário duplo** (`react-day-picker` em modo `range`, `numberOfMonths={2}`) com header de mês/ano selecionável via dropdown (`Select` de meses e anos navegáveis), locale `ptBR`.
- Abaixo do calendário: checkbox **Comparar** (default ligado) + 3 campos lado a lado — preset de comparação (Período anterior, Ano anterior, Personalizado) e duas datas read-only mostrando o range comparativo calculado.
- Rodapé: texto leve "Fuso horário das datas: Horário de São Paulo" à esquerda; botões **Cancelar** e **Atualizar** à direita (atualizar só fecha e aplica filtros).
- Componente isolado em `src/components/pdv/tasks/report/DateRangeFilter.tsx` reutilizável.

### Outros filtros
- **Setor**: multi-select (Cozinha, Salão, Caixa, Bar, Estoque, Gerência) — enum `sector` existente.
- **Turno**: multi-select (Manhã/Tarde/Noite mapeados para Abertura/Tarde/Fechamento).
- Todos os blocos abaixo reagem aos filtros via `useQuery` keyado no objeto `filters`.

## Seções

1. **Indicadores (4 cards)**: Total + Δ% vs período anterior; Taxa de conclusão com `Progress` verde≥80% / amarelo 60–80% / vermelho<60%; Atrasadas (qtd + %); Itens críticos em aberto (itens não conformes marcados como críticos + alertas críticos não reconhecidos).
2. **Evolução**: `LineChart` (recharts) com 3 séries — conclusão diária, meta (linha contínua, valor de `operational_task_settings.target_completion_rate`, default 85% client-side), período anterior (linha tracejada).
3. **Por setor**: cards/linhas ordenados do pior para o melhor — nome, total, atrasadas, críticos, barra colorida por taxa. Click filtra demais blocos.
4. **Equipe**: tabela com avatar+nome, setor, total, no prazo, score, variação. Linha clicável → `onNavigate("equipe")` levando ID via state em `Tasks.tsx`.
5. **Top 5 checklists com falhas**: nome, setor, execuções, % no prazo, item mais ignorado (maior contagem de `checklist_execution_items.is_compliant=false`).
6. **Alertas**: contagens por tipo (temperatura, item crítico, atraso) + lista dos 5 não reconhecidos mais recentes com botão "Reconhecer" (update `is_acknowledged=true`).

**Estado vazio**: ícone `ClipboardX`, "Sem dados no período selecionado", botão "Limpar filtros".

## Detalhes técnicos

**Novos arquivos**
- `src/components/pdv/tasks/OperationalReport.tsx` — container + grid + estado vazio.
- `src/components/pdv/tasks/report/DateRangeFilter.tsx` — popover replicando a referência.
- `src/components/pdv/tasks/report/MetricsCards.tsx`
- `src/components/pdv/tasks/report/EvolutionChart.tsx`
- `src/components/pdv/tasks/report/SectorBreakdown.tsx`
- `src/components/pdv/tasks/report/TeamRanking.tsx`
- `src/components/pdv/tasks/report/TopFailingChecklists.tsx`
- `src/components/pdv/tasks/report/AlertsPanel.tsx`
- `src/hooks/use-operational-report.ts` — recebe `filters` e expõe `{ metrics, evolution, bySector, teamRanking, topFailing, alerts, isLoading }` via `useQueries` em `checklist_executions` (+ joins), `checklist_execution_items` agregado e `checklist_alerts`. Faz queries paralelas para o período atual e o de comparação.

**Arquivos editados**
- `src/pages/pdv/Tasks.tsx`: substituir `case "hoje"` para renderizar `<OperationalReport onNavigate={setActiveSection} />`; remover import de `DailyTasksView`; rótulo do NAV "Tarefas do Dia" → "Relatório Geral", ícone `ListChecks` → `BarChart3`.

**Tokens visuais**: usar apenas `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border`, `text-primary`, `bg-primary` (memória de cores do projeto). Sem gradientes.

**Fora de escopo**: Painel, Checklists, Agendamento, Equipe, Configurações, Score, Evidências, Validade, Logs, RLS, edge functions, esquema atual.

## Diagrama

```text
+---------------------------------------------------------------+
| [📅 Últimos 30 dias: 19/abr a 18/mai] [Setores v] [Turnos v]  |
+---------------------------------------------------------------+
| Total |  Conclusão  | Atrasadas | Críticos abertos            |
+---------------------------------------------------------------+
| Evolução diária (atual + meta + período anterior tracejado)   |
+----------------------------+----------------------------------+
| Por setor (pior→melhor)    | Ranking da equipe (clicável)     |
+----------------------------+----------------------------------+
| Top 5 checklists com falhas| Alertas (por tipo + 5 recentes)  |
+----------------------------+----------------------------------+
```
