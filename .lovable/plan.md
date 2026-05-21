# Sincronização em tempo real do cardápio na frente de caixa

## Problema

Hoje, ao editar produtos / categorias / opções no Cardápio (Produtos do PDV e Delivery), a frente de caixa (`/pdv/caixa`, `AddItemDialog`, `ComandaAddItemDialog`, `PaymentDialog`, `GarcomNewOrderSheet` etc.) só vê as mudanças após dar F5. Os hooks `usePDVProducts`, `useDeliveryProducts`, `useProductOptions`, `useDeliveryCategories` etc. já invalidam o cache quando a mutação acontece **na mesma aba**, mas não quando a edição vem de outra aba/usuário.

## Solução

Assinar Postgres Changes via Supabase Realtime nas tabelas do cardápio e, a cada evento (`INSERT/UPDATE/DELETE`), invalidar as query keys do React Query correspondentes. Sem mexer em lógica de negócio nem em UI.

## Escopo (tabelas a observar)

Catálogo PDV (usado na frente de caixa e no Garçom):
- `pdv_products`
- `pdv_product_options`
- `pdv_product_option_items`
- `pdv_compositions` / `pdv_composition_groups`

Catálogo Delivery (usado no balcão de delivery e cardápio público):
- `delivery_products`
- `delivery_categories`
- `delivery_product_options`
- `delivery_product_option_items`

## Implementação

### 1. Novo hook genérico `src/hooks/use-realtime-invalidate.ts`

```ts
useRealtimeInvalidate({
  channel: "pdv-catalog",
  tables: [
    { table: "pdv_products",              keys: [["pdv-products"]] },
    { table: "pdv_product_options",       keys: [["pdv-product-options"], ["product-options"]] },
    { table: "pdv_product_option_items",  keys: [["pdv-product-options"], ["product-options"]] },
    { table: "pdv_compositions",          keys: [["pdv-compositions"]] },
    { table: "pdv_composition_groups",    keys: [["pdv-composition-groups"]] },
  ],
  filter: (row) => row.user_id === visibleUserId, // quando aplicável
});
```

Internamente: cria um `supabase.channel(...)`, adiciona um listener `postgres_changes` por tabela (`event: '*', schema: 'public'`), filtra por `user_id` quando a tabela tiver essa coluna, e chama `queryClient.invalidateQueries({ queryKey })` para cada key. Cleanup remove o canal no unmount. Debounce de ~150 ms para agrupar bursts.

### 2. Migration: habilitar Realtime

```sql
ALTER TABLE public.pdv_products              REPLICA IDENTITY FULL;
ALTER TABLE public.pdv_product_options       REPLICA IDENTITY FULL;
ALTER TABLE public.pdv_product_option_items  REPLICA IDENTITY FULL;
ALTER TABLE public.pdv_compositions          REPLICA IDENTITY FULL;
ALTER TABLE public.pdv_composition_groups    REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_products              REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_categories            REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_product_options       REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_product_option_items  REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.pdv_products,
  public.pdv_product_options,
  public.pdv_product_option_items,
  public.pdv_compositions,
  public.pdv_composition_groups,
  public.delivery_products,
  public.delivery_categories,
  public.delivery_product_options,
  public.delivery_product_option_items;
```
(usando `IF NOT EXISTS` / try-catch por tabela para não falhar se já estiverem na publicação).

### 3. Pontos de montagem do listener

Para evitar dezenas de canais, montar **uma vez** por área:

- **Frente de caixa**: novo componente `<PDVCatalogRealtime />` montado em `src/pages/PDV.tsx` (layout do PDV) — assina catálogo PDV.
- **Garçom**: montar o mesmo `<PDVCatalogRealtime />` em `src/pages/Garcom.tsx`.
- **Delivery (admin)**: novo `<DeliveryCatalogRealtime />` em `src/pages/pdv/delivery/Menu.tsx` e onde houver tela operacional de delivery (fila/checkout).
- **Cardápio público** (`src/pages/PublicMenu.tsx`): assinar `delivery_products`, `delivery_categories`, `delivery_product_options`, `delivery_product_option_items` filtrando pelo `user_id` do estabelecimento que já é resolvido na página, invalidando `["public-menu"]`.

Cada componente apenas chama o hook; não renderiza nada.

### 4. Multi-tenant / visibilidade

Filtrar por `user_id` via `useEstablishmentId().visibleUserId` (mesma chave usada pelos hooks de leitura), garantindo que funcionários do estabelecimento recebam updates do dono, e que tenants diferentes não recebam ruído.

## Fora do escopo

- Realtime de pedidos/comandas (já existe via `use-pdv-comandas-realtime` / `use-delivery-orders-watcher`).
- Mudanças visuais.
- Reescrita de hooks de leitura ou estratégia de cache.
- Otimistic UI.

## Verificação

1. Abrir `/pdv/caixa` em uma aba e `/pdv/produtos` em outra; alterar nome/preço/disponibilidade → caixa atualiza em <1s.
2. Adicionar/remover opção de produto → `AddItemDialog` mostra a opção sem F5.
3. Editar `delivery_products` → cardápio público (`/cardapio/<slug>`) atualiza.
4. Verificar no Network que apenas 1 WebSocket por área é aberto.
