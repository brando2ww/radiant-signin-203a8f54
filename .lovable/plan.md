# Imprimir somente as opções selecionadas

## Problema

Produtos com grupos de opções (ex.: escolher 2 sabores de 4) estão imprimindo TODOS os itens cadastrados, e não apenas os que o garçom selecionou.

## Causa raiz

No fluxo de adicionar item da comanda (`useDraftCart` → `usePDVComandas.addItem`):

1. O `MobileProductOptionSelector` coleta as opções escolhidas em `selectedOptions` (cada item carrega `linkedProductId` e `printerStation`).
2. Esse array fica salvo apenas no `DraftCart`. Quando o garçom envia para a cozinha (`handleFlushDraft` em `GarcomComandaDetalhe` e `GarcomMesaDetalhe`), o `persistItem` é chamado **sem** `selectedOptions` — somente as notas textuais sobrevivem.
3. Dentro do `addItemMutation`, se o produto tem `is_composite = true`, é chamado `expandComposition` (em `src/utils/expandComposition.ts`), que insere como filhos para roteamento de cozinha **todos** os componentes cadastrados em `pdv_product_compositions`, ignorando a seleção do cliente.
4. Em `sendToKitchen`, esses filhos são incluídos via `parent_item_id` e a Print Bridge imprime cada um — daí a cozinha receber todos os itens.

O fluxo do PDV (`ComandaAddItemDialog` e `AddItemDialog`) tem o mesmo problema: monta `linkedPrinterStations` mas o handler em `pages/pdv/Comandas.tsx` descarta o campo antes de chamar `addItem`.

## Solução

Passar a seleção do cliente até o `addItem` e criar filhos apenas para os itens efetivamente escolhidos (quando o produto usa option groups). Manter o `expandComposition` atual para kits fixos (produtos compostos sem option groups).

### Mudanças

1. **`src/contexts/DraftCartContext.tsx`** — já guarda `selectedOptions`; nenhuma mudança.

2. **`src/utils/expandSelectedOptions.ts`** (novo) — função que recebe `selectedOptions: SelectedOption[]` + `parentQuantity` + `ownerUserId` e retorna `ExpandedChild[]`, usando `linkedProductId` como `product_id` e resolvendo `production_center_id` via `resolveProductionCenterId` a partir do `printerStation` do linked product. Itens sem `linkedProductId` são ignorados (são apenas modificadores de preço).

3. **`src/hooks/use-pdv-comandas.ts` (`addItemMutation`)**
   - Adicionar `selectedOptions?: SelectedOption[]` ao payload.
   - Lógica nova:
     - Se `selectedOptions` tem itens com `linkedProductId` → expandir via `expandSelectedOptions` e **pular** `expandComposition` (mesmo se `is_composite = true`).
     - Caso contrário → manter `expandComposition` como hoje (kits fixos continuam funcionando).
   - Inserir os filhos com `parent_item_id`, `is_composite_child = true`, `unit_price = 0`, `production_center_id` resolvido.

4. **`src/hooks/use-pdv-orders.ts` (`addItemMutation`)** — mesmo tratamento, simétrico ao das comandas.

5. **Repasse de `selectedOptions` para o `addItem`**:
   - `src/pages/garcom/GarcomComandaDetalhe.tsx` — `handleFlushDraft`: incluir `selectedOptions: it.selectedOptions`.
   - `src/pages/garcom/GarcomMesaDetalhe.tsx` — idem.
   - `src/components/pdv/ComandaAddItemDialog.tsx` — passar `selectedOptions` no `onAddItem` (remover/ignorar `linkedPrinterStations`, que não é usado em lugar nenhum).
   - `src/components/pdv/AddItemDialog.tsx` — passar `selectedOptions` no callback do PDV de pedido em mesa.
   - `src/pages/pdv/Comandas.tsx` (`handleAddItem`) e `src/pages/pdv/Salon.tsx` (handlers equivalentes) — repassar `selectedOptions` ao `addItem`.

### Detalhes técnicos

- `expandSelectedOptions` mantém o mesmo formato de retorno (`ExpandedChild`) que `expandComposition`, então o restante do `addItemMutation` (toast "sem centro de produção", insert dos filhos, fluxo da Print Bridge) permanece intacto.
- `notes` textual com a lista de opções (já gerado em `optionsNotes`) continua sendo gravado no pai — bom para o resumo na comanda e para itens de opção que não têm `linkedProductId`.
- Não há alteração no schema, na Print Bridge nem nas migrations.

### Não escopo

- Não vou mexer no fluxo de delivery (já usa `delivery_order_item_options` corretamente).
- Não vou alterar a baixa de estoque dos sub-produtos (já tratada pelo `linked_product_id` do item de opção em outro caminho).
