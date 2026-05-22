## Problema

Na tela `/pdv/delivery/cardapio`, arrastar um produto para cima ou para baixo dentro da categoria está confuso e o resultado não bate com o que o usuário soltou.

## Causas identificadas

1. **Estratégia de ordenação errada para grid.** Em `CategorySection.tsx` os produtos são renderizados em grid 2 colunas (`grid-cols-1 xl:grid-cols-2`) mas o `SortableContext` usa `verticalListSortingStrategy`. Isso faz o dnd-kit calcular as posições como se fosse uma única coluna, deixando o "preview" do arrasto desalinhado dos slots reais — o item parece "pular" para uma posição que não corresponde ao que está sob o cursor.
2. **Sem atualização otimista.** O `useReorderProducts` só reflete a nova ordem depois que o `UPDATE` no Supabase retorna e o `invalidateQueries` refaz o fetch. Entre soltar o item e a lista re-renderizar há um flash em que a ordem antiga volta a aparecer — reforça a sensação de "não funcionou".
3. **Alça de arraste só aparece no hover.** O `GripVertical` tem `opacity-0 group-hover:opacity-100`. Em telas touch / trackpad isso dificulta acertar a alça e o usuário acaba arrastando o card pelo corpo (que dispara `onClick` para editar). Fica parecendo que o drag "não pega".

## Plano de correção (somente front-end do cardápio)

1. **`src/components/delivery/menu/CategorySection.tsx`**
   - Trocar `verticalListSortingStrategy` por `rectSortingStrategy` (correto para grids 2D do dnd-kit).
   - Manter o `closestCenter` (ok para grid).

2. **`src/hooks/use-delivery-products.ts` (`useReorderProducts`)**
   - Adicionar update otimista: no `onMutate`, ler o cache de `["delivery-products", userId]`, aplicar os novos `order_position`, reordenar e gravar de volta; em `onError` restaurar o snapshot; manter o `invalidateQueries` no `onSettled` para `delivery-products`, `public-products` e `public-menu`.
   - Resultado: a nova ordem fica visível instantaneamente ao soltar, sem flash.

3. **`src/components/delivery/menu/ProductCard.tsx`**
   - Deixar a alça de arraste sempre visível (remover `opacity-0 group-hover:opacity-100`, manter cor suave). Garante que o usuário sempre tenha onde "pegar" o card, inclusive em touch.

## Reflexo no cardápio público

Já existe `PublicMenuRealtime` ouvindo `delivery_products` e invalidando `["public-products", userId]` e `["public-menu"]`. Como o `update` de `order_position` dispara o evento Realtime, o cardápio público re-busca automaticamente e mostra a nova ordem — nenhuma mudança extra é necessária ali. O ajuste no `onSettled` da mutation cobre o caso de quem está com o cardápio público aberto na mesma sessão/aba.

## Fora do escopo

- Não mexer no drag de categorias, nem em produtos do PDV, nem na lógica de RLS / banco.
- Não alterar a aparência do card além de tornar a alça visível.