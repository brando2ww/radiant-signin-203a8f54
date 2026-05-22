## Objetivo

Na impressão da cozinha:
1. Os itens filhos (composição) devem sair **na ordem dos grupos configurados** (Etapa 1, 2, 3...) e dentro de cada grupo na ordem em que o garçom selecionou.
2. Cada filho deve ser impresso com o **rótulo do grupo (ex.: "Etapa 1")** ao invés de `(parte de: MONTE SEU POKE)`.
3. O **OBS gigante no produto pai** com a lista das etapas deve ser removido — a informação já está nos filhos.

## Causa atual

- `GarcomAdicionarItem.tsx`, `AddItemDialog.tsx` e `ComandaAddItemDialog.tsx` concatenam todas as `selectedOptions` em `notes` do pai → vira o "OBS: Etapa 01: …; Etapa 02: …" no cupom.
- Filhos são inseridos como `pdv_comanda_items` sem qualquer referência ao grupo de origem. A view de impressão (`vw_print_bridge_comanda_items`) só expõe `parent_product_name`, então o `print-bridge/server.js` imprime `(parte de: <PAI>)`.
- Sem campo de ordem por grupo, o sort atual do front (`sortParentsThenChildren`) só consegue garantir pai-antes-de-filho — a ordem entre filhos é arbitrária.

## Mudanças

### 1) Banco — migração

Adicionar duas colunas em `public.pdv_comanda_items` e `public.pdv_order_items`:

- `composition_group_label TEXT NULL` — nome do grupo (ex.: "Etapa 1", "Proteína").
- `composition_position INTEGER NULL` — índice estável para ordenação (grupo*1000 + selecionado).

Recriar as views `vw_print_bridge_comanda_items` e `vw_print_bridge_order_items` expondo esses dois campos.

### 2) `src/utils/expandSelectedOptions.ts`

- Estender `ExpandedChild` (local, opcional) com `composition_group_label` e `composition_position`.
- Ao percorrer `selectedOptions` (já vem na ordem dos grupos definida em `MobileCompositionGroupSelector` / dialogs PDV), filtrar para itens com `linkedProductId` e atribuir:
  - `composition_group_label = optionName`
  - `composition_position = groupIndex * 1000 + itemIndexNoGrupo`
- `expandComposition` (kits) recebe os mesmos campos como `null` (kits fixos não têm grupo de escolha).

### 3) `src/hooks/use-pdv-comandas.ts` e `src/hooks/use-pdv-orders.ts`

- Ao montar `childRows`, incluir `composition_group_label` e `composition_position` vindos do expansor.
- Em `sendToKitchenMutation.sortParentsThenChildren`: depois de agrupar filhos por `parent_item_id`, ordenar cada lista de filhos por `composition_position` (ascendente, `null` por último).

### 4) Remover o OBS de composição no pai

Em `GarcomAdicionarItem.tsx`, `src/components/pdv/AddItemDialog.tsx`, `src/components/pdv/ComandaAddItemDialog.tsx`:

- Mudar a construção de `optionsNotes` para incluir **apenas** opções cujos itens NÃO têm `linkedProductId` (extras/modificadores sem produto vinculado continuam como OBS no pai). Composições escolhidas viram filhos com rótulo e não devem ser duplicadas na OBS.

### 5) `print-bridge/server.js`

- No loop de itens, ao invés de imprimir `(parte de: PARENT)`, se o item tiver `composition_group_label`, imprimir uma linha discreta antes do nome:
  ```
  [Etapa 1]
  1x SALMÃO POKE
  ```
  (ou simplesmente prefixar: `  > Etapa 1`)
- Passar `composition_group_label` no `payload.items` na construção dos jobs (use-pdv-comandas / use-pdv-orders) e no mapeamento dentro do bridge.

## Arquivos afetados

- `supabase/migrations/<novo>.sql` (nova migração)
- `src/utils/expandSelectedOptions.ts`
- `src/utils/expandComposition.ts` (apenas tipo)
- `src/hooks/use-pdv-comandas.ts`
- `src/hooks/use-pdv-orders.ts`
- `src/pages/garcom/GarcomAdicionarItem.tsx`
- `src/components/pdv/AddItemDialog.tsx`
- `src/components/pdv/ComandaAddItemDialog.tsx`
- `print-bridge/server.js`

Sem alteração de RLS (novas colunas herdam as policies existentes da tabela).
