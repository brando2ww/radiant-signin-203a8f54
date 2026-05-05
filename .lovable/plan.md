# Exibir grupos de composição do PDV no Delivery

## Situação atual

- No PDV existem dois sistemas de "complementos":
  1. **`pdv_product_options` + `pdv_product_option_items`** — já são clonados para `delivery_product_options` / `delivery_product_option_items` pela RPC `delivery_clone_options_from_pdv`, e exibidos para o cliente em `ProductDetailModal`.
  2. **`pdv_product_composition_groups` + `pdv_product_compositions`** (Kits/Combos com sub-produtos) — usados no PDV/garçom, mas **não** são propagados para o delivery. Por isso, no menu público, o cliente não vê as opções para escolher.

O cliente do delivery hoje só enxerga as "opções" do sistema (1).

## Solução

Estender a RPC `delivery_clone_options_from_pdv` para também transformar cada **grupo de composição** em um `delivery_product_option`, e cada **sub-produto da composição** em um `delivery_product_option_item`. Assim, sem mudar o front-end do menu público, os kits passam a aparecer normalmente para o cliente escolher.

### Migration

Atualizar a função `public.delivery_clone_options_from_pdv(p_pdv_product_id uuid)`:

1. Continuar clonando `pdv_product_options` como hoje.
2. Adicionar um segundo loop iterando `pdv_product_composition_groups WHERE parent_product_id = p_pdv_product_id`.
3. Para cada grupo:
   - Inserir/atualizar um `delivery_product_options` com `source_pdv_option_id = <id do grupo>` (idempotente), copiando `name`, `type`, `is_required`, `min_selections`, `max_selections`, `order_position`.
4. Para cada `pdv_product_compositions` do grupo:
   - Resolver `linked_product_id` no delivery via `delivery_products.source_pdv_product_id = compositions.child_product_id`.
   - Inserir um `delivery_product_option_item` com:
     - `name = child_product.name`
     - `price_adjustment = 0` (o custo já está embutido no preço do kit)
     - `item_kind = 'product'`
     - `linked_product_id` = correspondente no delivery (pode ser `NULL` se o sub-produto não tiver sido compartilhado)
     - `source_pdv_option_item_id = <id da composição>` para idempotência
5. Manter `ON CONFLICT DO NOTHING` para reexecuções seguras.

Como `source_pdv_option_id` é compartilhado entre IDs de `pdv_product_options` e IDs de `pdv_product_composition_groups` (UUIDs distintos), não há colisão.

### Re-sincronização para produtos já compartilhados

Como hoje a RPC só roda no momento do compartilhamento, produtos antigos não receberiam os grupos. Solução: no botão existente de "Compartilhar com Delivery" (em `useShareToDelivery`), quando o produto **já está compartilhado**, em vez de bloquear, oferecer ainda assim chamar `delivery_clone_options_from_pdv` para "atualizar opções". Mudança mínima:

- Em `src/hooks/use-share-to-delivery.ts`: adicionar uma segunda mutation `useResyncDeliveryOptions(pdvProductId)` que apenas chama a RPC e invalida `["public-menu"]` / `["delivery-products"]`.
- Em `src/components/pdv/ProductDialog.tsx` (ou onde aparece o badge "Já no delivery"), expor um botão "Sincronizar opções com o delivery".

### Sem mudanças no front público

`ProductDetailModal.tsx` já renderiza qualquer `delivery_product_options` com seus items, então os grupos clonados aparecerão automaticamente como blocos de escolha (single/multiple) com a mesma UI.

### Pontos não cobertos (intencionalmente)

- **Sincronização automática** quando o usuário edita um grupo no PDV: não criaremos triggers nesta etapa (manteríamos consistente com o padrão atual de `pdv_product_options`, que tem trigger; podemos adicionar depois se desejado).
- **Estoque dos sub-produtos no delivery**: continua sendo controlado pelo `stock_deduction_mode` no PDV; o delivery só exibe a escolha.
- **Preço variável por sub-produto**: assumimos `price_adjustment = 0`. Se o cliente quiser preços diferenciados por escolha, isso seria uma evolução posterior (campo extra no grupo).

## Arquivos afetados

- Nova migration SQL: `CREATE OR REPLACE FUNCTION public.delivery_clone_options_from_pdv(...)` com a lógica adicional.
- `src/hooks/use-share-to-delivery.ts`: nova mutation de re-sync.
- `src/components/pdv/ProductDialog.tsx` (ou `ShareToDeliveryButton`): botão "Sincronizar opções".
