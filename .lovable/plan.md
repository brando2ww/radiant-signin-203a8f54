## Problema

O hook `use-pdv-cmv.ts` calcula custo apenas a partir de `pdv_product_recipes` (fichas técnicas com insumos). No banco do Ederson há **0 fichas técnicas**, mas existem **488 composições** (`pdv_product_compositions`) — kits/combos que ligam um produto pai a produtos filhos. Por isso o relatório aparece zerado mesmo com "receitas" cadastradas.

## Solução

Expandir o cálculo de custo unitário do produto em `usePDVCmv` para considerar três fontes, de forma combinada e recursiva:

1. **Ficha técnica** (`pdv_product_recipes`) → soma `quantity × ingredient.unit_cost`.
2. **Composição/kit** (`pdv_product_compositions`) → soma `quantity × custo do produto filho` (recursivo).
3. Fallback: produto sem nenhuma das duas continua fora do relatório (mesmo comportamento atual).

### Algoritmo

```text
costOf(product, visited):
  if product in visited: return 0          // proteção contra ciclo
  visited.add(product)
  recipeCost  = soma das receitas do produto
  compoCost   = soma( child.quantity * costOf(child, visited) )
  return recipeCost + compoCost
```

Memoizar resultados em um `Map<productId, number>` para não recomputar.

### Mudanças concretas em `src/hooks/use-pdv-cmv.ts`

- Buscar todas as composições do tenant (uma query) e indexar por `parent_product_id`.
- Buscar todas as receitas com insumos (já feito) e indexar por `product_id`.
- Implementar `computeCost(productId)` recursivo com memoização e set de visitados.
- Substituir o uso atual de `recipeCostMap[p.id]` por `costMap.get(p.id)` ao montar `productCmvList`, `totalCmv` e `evolution[].cmv`.
- Filtro do relatório: incluir o produto se `costMap.get(id) > 0` (em vez de só "tem receita").
- Manter `ingredientCategoryTotals` somando apenas a parcela vinda de receitas (composições não têm categoria de insumo direta — o filho que contribuir via receita já será contabilizado quando processado).

### O que NÃO muda

- UI da página `ProductCMV.tsx`.
- Estrutura de retorno do hook (mesmas chaves).
- Outras telas (DRE etc.) — fora do escopo desta correção.

## Observação ao usuário

Após o ajuste, produtos cujo custo vem de kits/combos passarão a aparecer **se os produtos-filhos tiverem ficha técnica com insumos**. Se os filhos também não tiverem ficha, o relatório seguirá mostrando custo 0 / produto fora — nesse caso o caminho é cadastrar a ficha técnica nos itens-base (matérias-primas), em Produtos → Editar → aba Receita.
