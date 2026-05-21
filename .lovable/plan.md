## Objetivo

Hoje a Galeria de Evidências (`/pdv/tarefas` → aba Fotos/Evidências) mostra todas as fotos em uma grade plana e desordenada, ordenadas só pelo `id` interno. O filtro só aceita **uma** data exata. Vamos:

1. Ordenar sempre da mais recente para a mais antiga.
2. Agrupar as fotos por **data de execução** (com cabeçalho "Hoje", "Ontem", "21 de mai. de 2026" etc.).
3. Trocar o filtro de "data única" por **período (de / até)** com presets rápidos (Hoje, Ontem, Últimos 7 dias, Últimos 30 dias).
4. Adicionar um **campo de busca** (item, checklist, colaborador, comentário).

## Mudanças

**`src/hooks/use-checklist-evidence.ts`**
- `EvidenceFilters`: substituir `date?: string` por `dateFrom?: string` e `dateTo?: string`; adicionar `search?: string`.
- Na query, usar `gte`/`lte` em `checklist_executions.execution_date` quando houver período; manter compatibilidade lendo `date` como atalho (from=to).
- Ordenar resultado final por `executionDate` desc, depois `completedAt` desc.
- Aplicar `search` (case-insensitive) sobre `itemTitle`, `checklistName`, `operatorName`, `reviewComment`.

**`src/components/pdv/checklists/evidence/EvidenceFilters.tsx`**
- Trocar o `<Input type="date">` único por dois inputs `De` e `Até`.
- Adicionar `<Select>` "Período" com presets: Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, Este mês, Personalizado.
- Adicionar `<Input>` de busca com ícone de lupa (debounced 250 ms via `useEffect`).
- Manter os demais selects (setor, colaborador, checklist, status, tipo).

**`src/components/pdv/checklists/EvidenceGallery.tsx`**
- Agrupar `evidence` por `executionDate` antes de renderizar.
- Renderizar cada grupo com cabeçalho fixo: rótulo da data (`Hoje` / `Ontem` / `dd 'de' MMM 'de' yyyy` em pt-BR via `date-fns`) + contagem de fotos do dia.
- Em modo "grid", cada grupo vira uma seção com sua própria grade `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
- Em modo "lista", passar os grupos para `EvidenceListView` (ou agrupar internamente lá com um separador por data).
- `handleExportZip`: nome do arquivo dentro do ZIP já inclui `executionDate`; nome do ZIP usa intervalo (`evidencias_2026-05-14_a_2026-05-21.zip`).

## Notas técnicas

- Sem mudança de schema do banco.
- Datas formatadas com `date-fns` + locale `ptBR` (já em uso no projeto, conforme memória de localização).
- Cores: somente tokens semânticos (`bg-card`, `text-foreground`, `text-muted-foreground`), sem cores customizadas.
- Componentes `Select` continuam usando `"all"` internamente para placeholder, conforme padrão do projeto.
