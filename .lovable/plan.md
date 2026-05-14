Reverter os cards de Promotores, Neutros e Detratores ao comportamento anterior (abrir o `NPSDetailDialog` com filtro), mantendo os demais cards navegando para suas páginas.

## Mudanças

- `EvaluationsDashboard.tsx`:
  - Restaurar `import NPSDetailDialog, { NpsCategory }`.
  - Restaurar estado `npsFilter` / `setNpsFilter`.
  - Passar `onNpsClick={setNpsFilter}` para `DashboardKPICards`.
  - Renderizar novamente `<NPSDetailDialog category={npsFilter} evaluations={evaluations || []} onClose={() => setNpsFilter(null)} />`.

- `DashboardKPICards.tsx`:
  - Reintroduzir prop opcional `onNpsClick?: (c: "promoters" | "neutrals" | "detractors" | "all") => void`.
  - Trocar os 3 cards (Promotores, Neutros, Detratores) de `ClickableCard` (que navega) de volta para `<Card>` com `onClick={() => onNpsClick?.(...)}`, mantendo `cursor-pointer hover:shadow-md transition-shadow` como era antes.
  - Demais cards permanecem como `ClickableCard` com navegação (NPS Global, Média Geral, Campanhas, Aniversariantes, Total de Respostas, Cadastros, Cupons Gerados, Cupons Utilizados).
  - O card "Total de Respostas" continua navegando para `relatorios/por-pergunta` (não muda).

Sem alterações de cor; mantém o padrão visual atual.