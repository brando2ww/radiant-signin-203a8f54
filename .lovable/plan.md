## Objetivo

No app dos garçons (`/garcom/comanda/:id/adicionar`), produtos como **Monte Seu Poke** que têm **grupos de composição** (`pdv_product_composition_groups`, ex.: "Etapa 01 — escolha 1", "Etapa 02 — escolha 3", "Etapa 03 — escolha 1") devem permitir que o garçom escolha quais itens entram, e a impressão na cozinha deve sair apenas com os escolhidos — não com a composição inteira.

## Causa atual

- `GarcomAdicionarItem.tsx` só renderiza `MobileProductOptionSelector` para `pdv_product_options` (extras/sabores). Não existe nenhum UI no app do garçom (nem no PDV) para selecionar `pdv_product_composition_groups`.
- Como o garçom não escolhe nada, `selectedOptions` chega vazio. No hook `usePDVComandas.addItem`, como o produto é `is_composite=true`, ele cai no fallback `expandComposition`, que insere **todos** os filhos de `pdv_product_compositions` — daí a impressão sair com tudo.
- A "porta dos fundos" já existe: quando `selectedOptions` traz itens com `linkedProductId`, `expandSelectedOptions` é usado e `expandComposition` é pulado. Basta alimentar `selectedOptions` com a seleção das composições.

## Mudanças (apenas frontend, no fluxo do garçom)

### 1. Novo componente `src/components/garcom/MobileCompositionGroupSelector.tsx`

Espelha visualmente o `MobileProductOptionSelector` (mesmo padrão de etapas, badges "Obrigatório", checkmarks, footer sticky "Continuar"), mas consome `CompositionGroup[]` do hook `useCompositionGroups`.

- Cada grupo aplica `type` (`single`/`multiple`), `is_required`, `min_selections`, `max_selections`.
- `allow_quantity=true` (caso da Etapa 02) renderiza um stepper `−/+` por item dentro do grupo `multiple`, somando até `max_selections`. Default `allow_quantity=false` mantém o toggle binário.
- Validação: cada grupo obrigatório precisa atingir `min_selections` (somando quantidades, quando `allow_quantity`).
- Confirmação emite o mesmo shape `SelectedOption[]` já usado no resto do fluxo:
  ```
  {
    optionId: group.id,
    optionName: group.name,
    items: [{
      itemId: composition.id,
      itemName: composition.child_product.name,
      priceAdjustment: 0,            // composições não somam preço
      linkedProductId: composition.child_product_id,
      printerStation: composition.child_product.printer_station ?? null,
      recipes: [],
      quantity: <quantidade escolhida quando allow_quantity>,
    }]
  }
  ```
  Quando `quantity > 1`, o item é repetido na lista (`items` ganha N entradas), para casar com o expansor existente sem alterar contratos.

### 2. `src/pages/garcom/GarcomAdicionarItem.tsx`

- Importar `useCompositionGroups` e `MobileCompositionGroupSelector`.
- Adicionar nova etapa `"composition"` ao fluxo: `composition → options → quantity`.
- `hasComposition = (compositionGroups?.length ?? 0) > 0`. Pula etapas vazias automaticamente (mesmo padrão do `effectiveStep` atual).
- Acumula `selectedOptions` somando as seleções de composição **e** de options (ambos no mesmo array `SelectedOption[]`).
- O resumo textual atual (`optionsNotes` em `notes`) passa a incluir as composições escolhidas, para o caso de impressão antiga que ainda lê `notes`.
- Botão "Voltar" da tela de quantidade volta para a etapa anterior correta (composition ou options).

Nenhuma mudança em hooks, mutations, RPCs ou impressão: o `selectedOptions` já é propagado por `useDraftCart` → `usePDVComandas.addItem` → `expandSelectedOptions`, que insere só os filhos escolhidos com `production_center_id` resolvido pelo `printer_station` do `child_product`.

## Fora de escopo

- Não alterar PDV/balcão nem delivery (usuário pediu o app dos garçons).
- Não mexer no editor de cadastro de composição.
- Não alterar layout/visual existente — o novo seletor segue o mesmo padrão visual do `MobileProductOptionSelector`.
