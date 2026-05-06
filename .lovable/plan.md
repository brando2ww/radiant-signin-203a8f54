## Diagnóstico

Verifiquei o banco: os preços já estão corretos em `delivery_product_option_items` (Shoyo R$ 2,00, Geléia R$ 5,00, Wassabi R$ 4,00, etc). A migration anterior funcionou.

O bug está só no **frontend** do cardápio público (`ProductDetailModal.tsx`):

Quando `allow_quantity` está ligado, o componente mostra `+{formatBRL(sub)}` onde `sub = price_adjustment × qty`. Como `qty` começa em **0**, sempre exibe **+R$ 0,00** mesmo quando o preço unitário é R$ 2,00.

## Correção

Em `src/components/public-menu/ProductDetailModal.tsx` (linhas 285-289), trocar para mostrar:
- O **preço unitário** quando `qty === 0` (ex.: `+R$ 2,00`)
- O **subtotal** (`preço × qty`) quando o cliente já incrementou (ex.: `+R$ 6,00` para 3 unidades)

```tsx
+{formatBRL(qty > 0 ? sub : Number(item.price_adjustment))}
```

Nenhuma outra mudança necessária — o backend já está sincronizando tudo corretamente.
