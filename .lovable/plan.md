## Objetivo

Reposicionar o módulo Delivery → Cardápio para ser **apenas curadoria visual** (organização, ordenação, visibilidade, categoria do delivery). Toda a **gestão de produto, preços, ficha técnica e opções/adicionais** acontece em **Administração → Produtos** (PDV). O delivery passa a consumir e exibir o que vier do PDV.

Hoje o estado é misto: o `ProductDrawer` do delivery permite editar nome, descrição, imagem, preço base, preço promocional, tempo de preparo, ficha técnica e opções/adicionais do delivery — duplicando o que já existe no PDV. Vamos eliminar essa duplicação.

## Escopo da mudança

### 1. Página `Administração → Produtos` (PDV) — passa a ser a única fonte de verdade

Já é hoje. Manter como está:
- CRUD de produto, preços (`price_salon`, `price_delivery`), descrição, imagem, ficha técnica, opções e adicionais, kits/composição, dados fiscais.
- O botão "Enviar para Delivery" (`ShareToDeliveryDialog`) continua sendo o caminho para publicar um produto no cardápio do delivery.
- Os triggers já existentes (`sync_pdv_product_to_delivery`, `sync_pdv_option_to_delivery`, `sync_pdv_option_item_to_delivery`, `sync_pdv_composition_*`) garantem que qualquer alteração no PDV se reflete automaticamente no `delivery_products`/`delivery_product_options` quando `sync_enabled=true`.

### 2. Página `Delivery → Cardápio` — vira só curadoria visual

**Remover do `ProductDrawer` (`src/components/delivery/menu/ProductDrawer.tsx`)** os campos e abas que duplicam o PDV:
- Aba "Ficha Técnica" → remover.
- Aba "Opções" → remover.
- Campos: Nome, Descrição, Imagem, Preço Base, Preço Promocional, Tempo de Preparo, Serve.

**Manter no Drawer** apenas o que é específico do delivery:
- Categoria (do delivery)
- Disponível (toggle on/off no delivery)
- Produto em destaque
- Disponível nos dias da semana
- Ordem (já é controlada por drag-and-drop fora do drawer — manter)

O Drawer vira read-only para os campos do PDV (nome, descrição, preço, imagem aparecem como texto/imagem informativa, com link "Editar no PDV" → navega para `/pdv/produtos?edit={source_pdv_product_id}`).

**Remover a ação "Novo Produto" do `MenuToolbar`** (`src/components/delivery/menu/MenuToolbar.tsx`). Substituir por "Adicionar do PDV" que abre um seletor com os produtos do PDV ainda não compartilhados (reusa o fluxo `useShareToDelivery`). Manter "Nova Categoria".

**Manter a ação "Excluir produto"** do cardápio (remove do delivery, sem afetar o PDV — equivale a "ocultar do delivery").

### 3. Ajustes de hooks

- `useUpdateProduct` (em `src/hooks/use-delivery-products.ts`) continua sendo usado, mas o Drawer só envia os campos visuais: `category_id`, `is_available`, `is_featured`, `available_days`, `order_position`.
- Os campos `name`, `description`, `image_url`, `base_price`, `promotional_price`, `preparation_time`, `serves` deixam de ser editáveis pelo delivery (continuam no payload apenas via sync trigger do PDV).

### 4. Pequena melhoria de UX

- Mostrar no card do produto (`src/components/delivery/menu/ProductCard.tsx`) um indicador discreto "Vinculado ao PDV" quando `source_pdv_product_id` estiver preenchido.
- No header do Drawer, quando vinculado: badge "Origem: PDV" + botão "Abrir no PDV".

## Resumo dos arquivos tocados

- `src/components/delivery/menu/ProductDrawer.tsx` — remover abas/campos editáveis do PDV; manter só categoria, disponibilidade, destaque, dias.
- `src/components/delivery/menu/MenuToolbar.tsx` — trocar "Novo Produto" por "Adicionar do PDV".
- `src/components/delivery/MenuTab.tsx` — trocar handler do botão para abrir um seletor de produtos do PDV (reusa `ShareToDeliveryDialog` ou cria `AddPDVProductDialog` simples listando produtos via `useSharedProductIds` para excluir os já adicionados).
- `src/components/delivery/menu/ProductCard.tsx` — badge "Vinculado ao PDV".
- (sem mudanças no banco — triggers de sync já existem)

## Validação

1. Em `Delivery → Cardápio`, abrir um produto vinculado ao PDV: nome, preço, descrição, imagem aparecem como informação read-only; Tabs de Ficha Técnica e Opções não existem; só categoria/disponibilidade/destaque/dias são editáveis.
2. Botão "Adicionar do PDV" abre lista dos produtos PDV ainda não publicados; ao escolher, cria o registro no delivery e clona opções/composição (já implementado).
3. Editar nome ou preço em `Admin → Produtos` reflete no cardápio do delivery automaticamente (trigger de sync existente).
4. Remover do delivery não apaga o produto do PDV.