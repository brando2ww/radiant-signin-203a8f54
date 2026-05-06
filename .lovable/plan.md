## Corrigir scroll do diálogo "Editar Opção"

O `DialogContent` está com `display: grid` herdado do shadcn (`grid w-full max-w-lg`) sobrepondo nossa classe `grid grid-rows-[auto_1fr_auto]`, e isso somado a `gap-4` do shadcn faz a área central não ter altura definida em alguns casos — o conteúdo transborda sem ativar o scroll.

### Mudanças em `src/components/delivery/ProductOptionDialog.tsx`

Trocar o `DialogContent` (linhas 188-197) para flex-col, que é mais previsível:

```tsx
<DialogContent
  ref={dialogContentRef}
  hideOverlay
  className="max-w-2xl w-[95vw] h-[85vh] max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden"
>
  <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
    <DialogTitle>{option ? "Editar Opção" : "Nova Opção"}</DialogTitle>
  </DialogHeader>

  <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
```

E no `DialogFooter` (linha 433) garantir `shrink-0`:

```tsx
<DialogFooter className="px-6 py-4 border-t bg-background shrink-0">
```

### Por que resolve

- `flex flex-col` + `flex-1 min-h-0` na área central é o padrão consagrado para scroll interno em modais de altura fixa, e não conflita com o `grid` default do shadcn (a classe `flex` ganha de `grid` no twMerge porque vem depois e ambas são `display`).
- `shrink-0` no header e footer impede que eles sejam comprimidos quando o conteúdo é grande.
- `gap-0` remove o `gap-4` herdado que estava criando espaço entre as linhas e atrapalhando o cálculo de altura.