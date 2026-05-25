# Reescrita da exibição da Galeria de Evidências

Reescrever apenas a camada visual de agrupamento e os cards. Filtros, busca, aprovação, reprovação, comentários, exportação, overview e seção de atenção permanecem inalterados.

## Agrupamento em 2 níveis

**Nível 1 — Dia** (rótulo via `date-fns` ptBR):
- "Hoje" / "Ontem" / "Segunda-feira, 19 de maio de 2026"
- Cabeçalho com: data + total de fotos + nº de pendentes
- Colapsável (todos abertos por padrão)

**Nível 2 — Turno**, derivado de `completedAt` (fallback: meio-dia se nulo):
- Manhã: 05:00–11:59
- Tarde: 12:00–17:59
- Noite: 18:00–04:59
- Cabeçalho com: nome do turno + faixa de horário + contagem de fotos
- Colapsável independente

Apenas turnos com fotos aparecem. Mensagem contextual no grupo de dia se algum turno típico ficar vazio após filtros ativos (ex.: "Sem evidências para o turno da Tarde com os filtros atuais").

## Ordenação dentro de cada turno
1. Pendentes (`reviewStatus == null` ou `"pendente"`)
2. Aprovadas
3. Reprovadas

Dentro de cada bucket: `completedAt` decrescente.

## Novo card de foto
Reescrever `EvidenceGridCard`:
- Imagem ocupa ~80% da altura (aspect-[4/5])
- Badge de status no canto superior direito com cores fortes:
  - Pendente: amarelo (`bg-yellow-500 text-yellow-950`)
  - Aprovada: verde (`bg-green-600 text-white`)
  - Reprovada: vermelho (`bg-destructive text-destructive-foreground`)
- Badge "Crítico" no canto superior esquerdo (quando aplicável)
- Ícone de balão (`MessageSquare`) no canto inferior direito quando `reviewComment` existir
- Rodapé compacto (text-xs/text-[11px]):
  - Linha 1: nome do item (line-clamp-2, font-medium)
  - Linha 2: colaborador • horário (HH:mm)
  - Linha 3: checklist (truncate, text-muted-foreground)
- Hover overlay com botões Ver/Aprovar/Reprovar mantido

## Componentes a criar/alterar
**Reescrever:**
- `src/components/pdv/checklists/EvidenceGallery.tsx` — substituir `groupedByDate` por estrutura aninhada `dia → turno → itens[]`; render dos accordions; ordenação por status.
- `src/components/pdv/checklists/evidence/EvidenceGridCard.tsx` — novo layout descrito acima.

**Criar:**
- `src/components/pdv/checklists/evidence/EvidenceDayGroup.tsx` — bloco de dia colapsável com header + lista de turnos.
- `src/components/pdv/checklists/evidence/EvidenceShiftGroup.tsx` — bloco de turno colapsável com grid de cards.
- `src/components/pdv/checklists/evidence/shift-utils.ts` — `getShift(completedAt)` e constantes `SHIFTS`.

**Sem alteração:**
- `use-checklist-evidence.ts`, filtros, lightbox, overview, attention section, modo lista, exportação ZIP/CSV.

## Detalhes técnicos
- Usar componente `Collapsible` do shadcn já presente no projeto.
- Cores via tokens semânticos quando possível; exceção apenas para o trio amarelo/verde/vermelho dos status (requisito explícito do usuário).
- Estado de collapse mantido em memória local (não persistido).
