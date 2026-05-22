## Problema

Em `/pdv/produtos`, ao clicar em "Duplicar", apenas os campos básicos da tabela `pdv_products` são copiados. Tudo que faz o produto realmente funcionar — ficha técnica (ingredientes), grupos de opções e seus itens, receitas dos itens de opção, e a composição (kits/combos) — fica de fora. O Delivery já tem um clone completo (`useDuplicateProduct` em `use-delivery-products.ts`); o PDV ainda usa um `createProduct({ ...product })` simples em `Products.tsx`.

## Solução

Criar um hook `useDuplicatePDVProduct` (em `src/hooks/use-pdv-products.ts`) que executa o clone profundo em uma única mutação e substituir o handler atual em `src/pages/pdv/Products.tsx`.

### O que será clonado (em ordem)

1. **Produto base** (`pdv_products`) — copia tudo exceto `id`, `user_id`, `created_at`, `updated_at`. Nome recebe sufixo ` (cópia)`. Preserva `is_composite`, `stock_deduction_mode`, dados fiscais (NCM/CEST/CFOP/origem/CST/etc), preços, tempos, disponibilidade.
2. **Ficha técnica do produto** (`pdv_product_recipes`) — `ingredient_id`, `quantity`, `unit` apontando para o novo `product_id`.
3. **Grupos de composição** (`pdv_product_composition_groups`) — clona cada grupo com `parent_product_id = novoProduto.id`, preservando `name`, `type`, `is_required`, `min_selections`, `max_selections`, `order_position`. Mantém mapa `oldGroupId → newGroupId`.
4. **Itens da composição** (`pdv_product_compositions`) — para cada item do produto original, insere com o novo `parent_product_id`, novo `group_id` (via mapa), mesmo `child_product_id`, `quantity`, `order_position`.
5. **Grupos de opções** (`pdv_product_options`) — clona cada opção e mantém mapa `oldOptionId → newOptionId`.
6. **Itens das opções** (`pdv_product_option_items`) — insere todos os itens da opção nova preservando ordem; mantém mapa `oldItemId → newItemId`. Copia também `linked_product_id` (sub-produto vinculado) quando existir.
7. **Receitas dos itens de opção** (`pdv_option_item_recipes`) — busca por `option_item_id IN (oldItemIds)` e reinsere usando `idMap`.

### Arquivos alterados

- `src/hooks/use-pdv-products.ts` — adicionar hook `useDuplicatePDVProduct` (mutation com toda a lógica acima), exportar `duplicateProduct` / `isDuplicating` no retorno de `usePDVProducts` (ou exportar como hook próprio, espelhando o padrão do Delivery). Invalida queries: `pdv-products`, `pdv-product-options`, `pdv-composition-groups`, `pdv-compositions`, `pdv-recipes`.
- `src/pages/pdv/Products.tsx` — substituir `handleDuplicate` (linha 104-107) para chamar `duplicateProduct(product.id)` em vez de `createProduct({ ...productData })`.

### Detalhes técnicos

- Mutation única (`mutationFn` async) com `try` sequencial — se algo falhar depois do insert do produto, retorna o erro e mostra toast (sem rollback transacional; o produto-base permanece, igual ao comportamento do Delivery hoje).
- Toast de sucesso: `"Produto duplicado com composição, opções e ficha técnica"`.
- Sem alterações de schema, sem migrações.
- Sem mudanças visuais — apenas o comportamento do botão "Duplicar" do menu de ações do `ProductCard`.
