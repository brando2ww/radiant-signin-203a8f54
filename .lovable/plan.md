O header já é full-width; o problema é que os itens do menu + status do caixa + notificações + avatar somam mais do que cabe, e o avatar (EP) acaba cortado na borda direita.

## Mudanças

**`src/pages/PDV.tsx`** (header bar)
- Adicionar `min-w-0` ao container do `PDVHeaderNav` e `shrink-0` no cluster da direita (`CashierStatus`, `PDVNotifications`, `PDVUserMenu`) para que o avatar nunca seja espremido/cortado.
- Reduzir o `gap-4` para `gap-2` e ajustar padding para `px-3` no header bar.

**`src/components/pdv/PDVHeaderNav.tsx`**
- Trocar o breakpoint dos rótulos de seção de `hidden lg:inline` para `hidden xl:inline` (≥1280px) — abaixo disso mostra só os ícones, evitando overflow horizontal em viewports intermediários (~1280–1500px) onde hoje os labels aparecem mas o conjunto não cabe.
- Garantir que a `NavigationMenuList` aceite encolher (`min-w-0`).

Sem mudanças de comportamento, rotas ou backend.