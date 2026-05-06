## Problema

No `src/components/delivery/ProductDialog.tsx` (cardápio do delivery, ex.: "Combo 2 Temaki"), o scroll interno não funciona. O `DialogContent` usa apenas `max-h-[90vh]` sem altura intrínseca (`h-[90vh]`). Com `flex flex-col`, os filhos com `flex-1 min-h-0` não têm altura de referência para se limitar — então o conteúdo cresce além do viewport, o footer some e o scroll interno do `TabsContent` (com `overflow-y-auto`) nunca é ativado.

Mesmo padrão que já corrigimos no `src/components/pdv/ProductDialog.tsx`.

## Mudança

**`src/components/delivery/ProductDialog.tsx` (linha 195)**

Trocar:
```tsx
<DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
```

Por:
```tsx
<DialogContent className="max-w-3xl w-[95vw] h-[90vh] max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
```

A adição de `h-[90vh]` dá altura intrínseca ao container flex; com isso o `Tabs` `flex-1 min-h-0` passa a ter espaço definido e o `overflow-y-auto` dos `TabsContent` (Detalhes, Ficha Técnica, Opções e Complementos) finalmente ativa o scroll interno enquanto header e footer permanecem fixos.

## Validação

Abrir um produto com várias opções (ex.: "Combo 2 Temaki") na aba "Opções e Complementos" — a lista deve rolar dentro do dialog enquanto o título e os botões "Cancelar/Salvar" permanecem visíveis.