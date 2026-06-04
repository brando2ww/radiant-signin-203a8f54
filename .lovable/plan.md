# Correções de UX — loading, empty states e feedback

Padrões aplicados a todos os itens:

- **Empty state**: card centralizado com ícone do `lucide-react` (Inbox/BarChart3/AlertCircle), título e descrição em `text-muted-foreground`.
- **Loading**: `<Skeleton />` do shadcn — nunca texto "Carregando…" nem `R$ 0,00` antes de carregar.
- **Erro**: card com `AlertCircle`, mensagem e botão "Tentar novamente" chamando `refetch()`.
- Cores apenas via tokens do design system (`bg-card`, `text-muted-foreground`, `text-destructive`).

## Componentes auxiliares (novos)

- `src/components/pdv/shared/EmptyState.tsx` — `{ icon, title, description, action? }`
- `src/components/pdv/shared/ErrorState.tsx` — `{ message, onRetry }`

Reutilizados em todos os locais abaixo.

## Itens

1. **`DRE.tsx`** — quando `!data || dre vazio`, renderizar `<EmptyState icon={FileBarChart2} title="Nenhum dado disponível" description="Não há movimento financeiro para o período selecionado." />`.

2. **`MonthlyReport.tsx`, `ByUserReport.tsx`, `CancellationsReport.tsx`** — antes de renderizar Recharts, checar `chartData.length === 0` e renderizar `<EmptyState />` no lugar.

3. **`GeneralCMV.tsx`** (l. 75-80) — mesmo padrão para o histórico vazio: "Sem histórico de CMV no período".

4. **`CashFlow.tsx`** (KPIs l. 104-124) — passar `isLoading` e `isError` do hook. Loading → `<Skeleton className="h-7 w-24" />` no lugar do valor. Erro → ícone `AlertCircle` + "—" no card e toast. Só mostrar `R$ 0,00` quando `!isLoading && !isError`.

5. **`ProductsAnalyticsReport.tsx`** (l. 221-238) — adicionar `if (isError) return <ErrorState onRetry={refetch} />` antes do skeleton.

6. **`MonthlyReport.tsx`** (KPIs l. 227-239) — receber `isLoading`; cada KPI exibe `<Skeleton />` enquanto carrega.

7. **`FinancialStatsCards.tsx`** — adicionar prop `isLoading?: boolean`; renderizar `<Skeleton />` nos 5 cards quando true. Atualizar todos os call sites (`FinancialTransactions`, etc.) para passar `isLoading`.

8. **`AccountsPayable.tsx` + `AccountsReceivable.tsx`** (l. 91-92) — substituir bloco `"Carregando…"` por grid de `<Skeleton />` com mesma altura dos cards reais (evita layout shift).

9. **`AccountsPayable.tsx` + `AccountsReceivable.tsx`** (l. 44-47) — remover `window.confirm`; usar `<AlertDialog>` do shadcn controlado por `useState<{id, description} | null>` com "Cancelar" e "Excluir" (destructive).

10. **`OverviewReport.tsx`** (l. 134-191) — envolver `exportToXlsx` em `try/catch`; `toast.error("Falha ao exportar relatório")` no catch; `toast.success("Relatório exportado")` no fim.

11. **`MarkAsPaidDialog.tsx`** (l. 47) — em vez de `if (!transaction) return null`, sempre renderizar `<Dialog>`; quando `!transaction`, conteúdo é `<div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>` para a animação de saída não travar.

## Arquivos alterados

**Novos (2):** `EmptyState.tsx`, `ErrorState.tsx`.

**Editados (12):** `DRE.tsx`, `MonthlyReport.tsx`, `ByUserReport.tsx`, `CancellationsReport.tsx`, `GeneralCMV.tsx`, `CashFlow.tsx`, `ProductsAnalyticsReport.tsx`, `FinancialStatsCards.tsx`, `FinancialTransactions.tsx` (call site), `AccountsPayable.tsx`, `AccountsReceivable.tsx`, `OverviewReport.tsx`, `MarkAsPaidDialog.tsx`.

Sem mudanças de schema ou de regra de negócio — somente UI/UX.
