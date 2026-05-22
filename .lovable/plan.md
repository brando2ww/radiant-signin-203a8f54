## Problema

A tela `/pdv/caixa` fica em loading skeleton porque um loop de renderização infinito está acontecendo no app (Maximum update depth exceeded), originado em `TransferItemsDialog`.

Stack do console aponta exatamente para o `useEffect` em `src/components/pdv/transfer/TransferItemsDialog.tsx` linhas 73-78:

```ts
useEffect(() => {
  const next: Record<string, number> = {};
  items.forEach((it) => (next[it.id] = it.quantity));
  draftItems.forEach((it) => (next[it.draftId] = it.quantity));
  setQtyMap(next);
}, [items, draftItems]);
```

`items` e `draftItems` (que tem default `= []`) recebem nova referência a cada render do pai. O effect dispara `setQtyMap` em todo render → re-render → loop infinito → React congela a árvore inteira (inclusive a página de Caixa que compartilha providers).

## Correção

Em `src/components/pdv/transfer/TransferItemsDialog.tsx`:

1. Calcular o "próximo qtyMap" via `useMemo` baseado em uma chave estável (ids+quantidades concatenados), evitando rebuild quando o conteúdo não muda.
2. No `useEffect`, comparar com o estado atual e só chamar `setQtyMap` se realmente houver diferença (shallow compare das chaves/valores). Dependência: a chave estável (string), não os arrays.

Resultado: o effect para de disparar em loop, a página do Caixa volta a renderizar normalmente.

Nenhuma outra alteração é necessária.