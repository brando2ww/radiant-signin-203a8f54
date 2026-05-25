# Refinos na Galeria de Evidências

## 1. Colapsado por padrão
- `EvidenceDayGroup` e `EvidenceShiftGroup`: estado inicial `open = false`.
- Usuário abre manualmente o dia/turno que quer inspecionar.

## 2. Cabeçalho do dia melhorado
Reescrever o header de `EvidenceDayGroup` com layout em duas linhas:
- **Linha principal:** chevron + data formatada (capitalizada) + ícone de calendário pequeno.
- **Linha secundária / lado direito:** mini-indicadores compactos em pills com ícones:
  - 📷 total de fotos
  - 🟡 pendentes (só aparece se > 0)
  - ✅ aprovadas (só aparece se > 0)
  - ❌ reprovadas (só aparece se > 0)
- Hover sutil; quando aberto, fundo levemente diferenciado.
- Header do turno também ganha contadores por status no canto direito.

## 3. Página dedicada "Atenção"
- Adicionar novo item de nav em `src/pages/pdv/Tasks.tsx`: `{ key: "atencao", label: "Atenção", icon: AlertTriangle }` posicionado logo após "Evidências".
- Criar `src/components/pdv/checklists/AttentionPanel.tsx`:
  - Usa o mesmo `useEvidenceGallery` + filtros (reaproveita `EvidenceFiltersBar` com filtros de período/operador/checklist/setor — sem o filtro de status, que é forçado).
  - **Critério de inclusão:** `(isCritical || isCompliant === false) && reviewStatus !== "aprovado" && reviewStatus !== "reprovado"`. Ou seja, só itens críticos/não-conformes ainda **pendentes**. Reprovadas saem (já tratadas) e aprovadas também.
  - Renderiza com a **mesma lógica dia → turno colapsável** (reusa `EvidenceDayGroup`/`EvidenceShiftGroup`), com a mesma ordenação.
  - Lightbox, aprovar/reprovar/comentários funcionam igual.
  - Estado vazio próprio: "Nenhuma evidência precisa de atenção no período. 🎉".
- Remover `EvidenceAttentionSection` da `EvidenceGallery` (a galeria principal não duplica mais essa lista).

## Arquivos
**Editar:**
- `src/components/pdv/checklists/evidence/EvidenceDayGroup.tsx` — colapsado por padrão; novo header.
- `src/components/pdv/checklists/evidence/EvidenceShiftGroup.tsx` — colapsado por padrão; contadores por status no header.
- `src/components/pdv/checklists/EvidenceGallery.tsx` — remover `<EvidenceAttentionSection />`.
- `src/pages/pdv/Tasks.tsx` — novo item de nav "Atenção" e roteamento para `AttentionPanel`.

**Criar:**
- `src/components/pdv/checklists/AttentionPanel.tsx` — painel dedicado.

**Sem alteração:**
- Hook `use-checklist-evidence`, filtros, lightbox, exportação, card de foto, overview, modo lista.
