# Modo "quantidade por item" em grupos de opções (delivery)

Adicionar comportamento opcional em cada grupo de opções/adicionais que substitui checkbox por controles − / + permitindo escolher múltiplas unidades do mesmo item.

## 1. Banco de dados

Adicionar coluna na tabela `delivery_product_options`:

- `allow_quantity boolean NOT NULL DEFAULT false`

Quando `true`, o grupo é renderizado em modo quantidade (vale para grupos `multiple` — não se aplica a `single`).

> Migração: `ALTER TABLE delivery_product_options ADD COLUMN allow_quantity boolean NOT NULL DEFAULT false;`

## 2. Admin — cadastro do grupo

`src/components/delivery/ProductOptionDialog.tsx`

- Adicionar estado `allowQuantity` (Switch).
- Renderizar o switch **somente quando** `type === "multiple"`, logo abaixo dos campos min/max:
  - Label: "Permitir múltiplas unidades por item"
  - Helper: "Cada item terá controles − e + em vez de checkbox."
- Inicializar a partir de `option?.allow_quantity` no `useEffect` de carregamento.
- Incluir `allow_quantity: type === "multiple" ? allowQuantity : false` no objeto enviado em `onSave`.

`src/hooks/use-product-options.ts`
- Estender a interface `ProductOption` com `allow_quantity?: boolean`.
- Garantir que o select traga a coluna (já é `*`) e que create/update propaguem o campo.

## 3. Cardápio público — modal de personalização

`src/hooks/use-public-menu.ts`
- Adicionar `allow_quantity?: boolean` em `PublicProductOption` (já é `select(*)`).

`src/pages/PublicMenu.tsx`
- Mudar a forma de `CartItem.selectedOptions` para suportar quantidade:
  ```
  selectedOptions: {
    optionId; optionName;
    itemId; itemName;
    priceAdjustment;   // unitário
    quantity: number;  // novo, default 1
  }[]
  ```
- O total de cada item no carrinho passa a somar `priceAdjustment * quantity`.
- Ajustar `ShoppingCart.tsx` (e qualquer cálculo de subtotal/checkout) para multiplicar por `quantity`. Ao exibir, listar como "2× Temaki de Salmão" quando `quantity > 1`.

`src/components/public-menu/ProductDetailModal.tsx`

Refatorar o estado:
- Trocar `selectedOptions: Record<string, string[]>` por `selectedOptions: Record<string, Record<string, number>>` (optionId → itemId → quantidade).
- Helpers: `getItemQty(optionId, itemId)`, `getOptionTotalQty(optionId)`.

Renderização por grupo (`option.type === "multiple"`):

- **Cabeçalho** (sempre que `multiple`): mostrar "X/Y selecionados" usando soma de quantidades. Se `getOptionTotalQty === max`, exibir badge "Completo".
- **Modo checkbox** (`!allow_quantity`): mantém comportamento atual (qty 0 ou 1).
- **Modo quantidade** (`allow_quantity === true`): para cada item, em vez de checkbox renderizar:
  ```
  [nome do item]                 [−] qty [+]   +R$ X,XX
  ```
  - `−` desabilitado quando `qty === 0`.
  - `+` desabilitado quando `getOptionTotalQty(optionId) >= max_selections`.
  - Subtotal do item à direita = `priceAdjustment * qty` (formatBRL). Se `priceAdjustment === 0`, ocultar.

`single` continua como RadioGroup (não há quantidade).

Cálculo:
- `calculateTotal` soma `Σ priceAdjustment * qty` de todos os grupos, multiplicado por `quantity` do produto.
- Botão `Adicionar • R$ X,XX` reflete em tempo real.

Validação:
- `validateOptions` usa soma de quantidades:
  - se `is_required` e total === 0 → erro
  - se total < `min_selections` → erro
  - se total > `max_selections` → erro
- Botão "Adicionar" fica `disabled` quando `validateOptions().length > 0` (em vez de só mostrar toast).

`handleAddToCart`:
- Iterar `selectedOptions[optionId]` e gerar uma entrada por item com `quantity` (não duplicar entradas).

## 4. Edge cases

- Grupos `single`: campo `allow_quantity` é ignorado.
- Reset de estado ao fechar/abrir modal continua igual.
- Itens indisponíveis (`is_available=false`) continuam filtrados.
- Produtos importados do PDV: mantêm `allow_quantity=false` (default).

## 5. Fora de escopo

- PDV salão / garçom (`MobileProductOptionSelector`, `ProductOptionSelector`) — não alterados nesta task; pode ser feito depois se solicitado.
- Cadastro de opções via PDV (`pdv_product_options`) — não alterado.
