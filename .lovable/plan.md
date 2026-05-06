## Problema

Com mouse wheel, o scroll dentro das abas "Ficha Técnica" e "Opções e Complementos" do `ProductDialog.tsx` (delivery) não funciona — apenas via teclado/Tab. O `overflow-y-auto` está aplicado direto no `TabsContent` do Radix, que tem comportamento de foco/role=tabpanel que pode interferir com eventos de wheel em alguns navegadores. Além disso, quando `flex-1 min-h-0` está no mesmo elemento que `overflow-y-auto`, a altura calculada pode ficar instável.

## Mudança

**`src/components/delivery/ProductDialog.tsx` (linhas 317-325)**

Mover o `overflow-y-auto` do `TabsContent` para um `<div>` filho dedicado, deixando o `TabsContent` apenas como container flex de altura fixa:

```tsx
<TabsContent value="recipe" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden overflow-hidden">
  <div className="h-full overflow-y-auto px-6 pb-6">
    {product && <DeliveryRecipeManager ... />}
  </div>
</TabsContent>

<TabsContent value="options" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden overflow-hidden">
  <div className="h-full overflow-y-auto px-6 pb-6">
    <ProductOptionsManager productId={product?.id} />
  </div>
</TabsContent>
```

## Por que resolve

Separar o container flex (TabsContent) do container de scroll (`<div>` puro) garante que o wheel event chegue num elemento DOM neutro com altura definida (`h-full`), sem interferência das responsabilidades de tabpanel do Radix.

## Validação

Abrir "Combo 2 Temaki" → aba "Opções e Complementos" → rolar com mouse wheel; deve funcionar normalmente.