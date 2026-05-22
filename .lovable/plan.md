## Problema

No comprovante impresso da cozinha, os itens da composição ("ABACATE POKE (parte de: MONTE SEU POKE)", etc.) estão saindo **antes** do produto pai ("MONTE SEU POKE"). O esperado é o pai primeiro e em seguida seus itens de composição.

## Causa

Em `src/hooks/use-pdv-comandas.ts` (mutation `sendToKitchenMutation`), as linhas para o job de impressão vêm de:

```ts
supabase.from("vw_print_bridge_comanda_items").select("*").in("id", allIds)
```

O Postgres não garante ordem sem `ORDER BY`, então pai e filhos saem misturados / filhos antes do pai. O `payload.items` é montado diretamente com `rows.map(...)` sem reordenação.

A view já expõe `id`, `parent_item_id` e `is_composite_child`, então temos tudo necessário no cliente.

## Mudança

Em `src/hooks/use-pdv-comandas.ts`, dentro de `sendToKitchenMutation`, antes do `rows.map(...)` que monta `payload.items`, ordenar `rows` para que, dentro de cada grupo de impressão:

1. Cada item pai (não-filho) apareça primeiro.
2. Imediatamente depois, seus filhos de composição (mesmos `parent_item_id === pai.id`), preservando a ordem original.
3. Itens órfãos (filhos sem pai presente no grupo) entram ao final.

Implementação: função local `sortParentsThenChildren(rows)` que:
- Separa pais (`!is_composite_child`) e filhos (`is_composite_child`).
- Agrupa filhos por `parent_item_id`.
- Retorna `[pai1, ...filhosDoPai1, pai2, ...filhosDoPai2, ...órfãos]`.

Aplicar essa ordenação ao array `rows` passado para `rows.map((r) => ({ product_name, ... }))` na construção dos `jobs`.

## Arquivos

- `src/hooks/use-pdv-comandas.ts` — adicionar a função utilitária e ordenar antes do `map` do payload (linha ~614).

Nenhuma alteração de schema, RLS, view ou em outros fluxos (PDV orders/delivery não foram reportados com o problema).
