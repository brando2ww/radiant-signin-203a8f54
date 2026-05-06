## Causa do problema

A coluna `allow_quantity` foi adicionada na tabela `delivery_product_options` e o admin (`ProductOptionDialog.tsx`) já salva o valor corretamente. O modal de personalização (`ProductDetailModal.tsx`) também já tem a lógica de renderizar os controles `[−] qty [+]` quando `option.allow_quantity === true`.

Porém, em `src/hooks/use-public-menu.ts` (linhas 85–102), o `select` da query `delivery_product_options` **não inclui o campo `allow_quantity`**. Como o Supabase só retorna as colunas explicitamente listadas, o campo chega como `undefined` no front e a condição `allowQty = isMultiple && !!option.allow_quantity` é sempre falsa — caindo no modo checkbox padrão.

## Correção

Adicionar `allow_quantity` ao select de `delivery_product_options` em `use-public-menu.ts`:

```ts
delivery_product_options (
  id,
  product_id,
  name,
  type,
  is_required,
  min_selections,
  max_selections,
  order_position,
  allow_quantity,
  delivery_product_option_items ( ... )
)
```

## Verificação

Após o ajuste:
1. Editar um grupo do tipo "Múltipla escolha" no admin e ativar o toggle "Permitir múltiplas unidades por item".
2. Recarregar o cardápio público e abrir o produto — os controles `−  qty  +` devem aparecer no lugar dos checkboxes para aquele grupo.
3. Grupos sem o toggle ativo continuam exibindo checkboxes normais.

Nenhuma outra mudança é necessária — toda a lógica de quantidade, validação, total e persistência já foi implementada nas iterações anteriores.