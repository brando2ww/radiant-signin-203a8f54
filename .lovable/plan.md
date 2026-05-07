## Problema

No `ProductCompositionManager`, ao adicionar sub-produtos a um grupo de composição (ex.: "Etapa 01"), todos são gravados com `order_position: 0` em `pdv_product_compositions`. Isso faz com que:

- No PDV, a lista do grupo apareça em ordem indeterminada (geralmente `created_at`).
- No cardápio público (`/cardapio/...`), os itens cheguem ordenados por `order_position` (todos = 0) e o desempate fique a cargo do Postgres, gerando uma ordem visual completamente diferente da cadastrada (ver capturas).

## Solução

1. **`src/hooks/use-pdv-composition-groups.ts` — `addItem`**
   - Antes do `insert`, calcular o maior `order_position` atual dentro do `groupId` (a partir de `groups[*].items` já em cache) e usar `max + 1` (0 se vazio).

2. **Nova migração SQL — backfill + ordenação consistente**
   - `UPDATE pdv_product_compositions` definindo `order_position` por `row_number()` particionado por `group_id` ordenado por `created_at`, apenas onde existem múltiplas linhas com o mesmo `order_position` no grupo (corrige o estado atual onde tudo é 0).
   - Em seguida, executar a função existente `delivery_clone_options_from_pdv` (via `UPDATE` no trigger ou chamada direta) para repropagar a ordem correta para `delivery_product_option_items`. Como o trigger `sync_pdv_composition_to_delivery` reage a INSERT/UPDATE/DELETE em `pdv_product_compositions`, o `UPDATE` do backfill já vai sincronizar automaticamente os itens de delivery existentes.

3. **`src/hooks/use-pdv-composition-groups.ts` — query**
   - Garantir `order` em `pdv_product_compositions` por `order_position` E desempate por `created_at`, para que o PDV mostre a mesma ordem do cardápio mesmo se houver empates antigos.

Sem alterações no `use-public-menu.ts` (já ordena por `order_position` no `foreignTable` correto) — basta os dados estarem corretos.

## Resultado

- Cada novo item entra no fim do grupo (ordem de cadastro).
- Itens já existentes ficam ordenados pela data de criação dentro de cada grupo.
- Cardápio público e PDV exibem os sub-produtos exatamente na ordem cadastrada.
