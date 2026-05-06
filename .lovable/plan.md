## Correções definitivas — Cards e Modal de Opções

Hipótese nova:
- **Cards**: o `<Card>` do shadcn já tem `rounded-lg` mas o `flex flex-col` interno não força a coluna a respeitar a largura; o conteúdo ainda transborda porque o wrapper interno `flex gap-3 p-3` não tem `min-w-0` e o `<div>` da imagem fica fora do bloco que reserva espaço para o texto. Solução: adicionar `min-w-0` em todos os flex-children que carregam texto e remover overflow só no nome (dropdown ⋮ está consumindo espaço).
- **Modal**: o `DialogContent` da shadcn aplica `grid` nativo. O `flex flex-col` aplicado por className entra em conflito com `grid` original (twMerge não substitui `grid` por `flex` confiavelmente em todos casos quando vem em ordem específica, mas o problema real é `max-h-[90vh]` sem altura fixa: quando o conteúdo é menor que 90vh ele não rola, e se for maior, o `flex-1` interno depende de o pai ter altura. Como o pai usa `max-h-[90vh]` (não `h-[90vh]`), o flex item `flex-1` colapsa para o tamanho do conteúdo e o overflow é perdido). Solução: usar `h-[85vh]` (altura fixa) + `grid grid-rows-[auto_1fr_auto]` para garantir que a linha do meio sempre tenha espaço definido para rolar.

### Mudanças

**`src/components/delivery/ProductOptionDialog.tsx`** (linha ~188)

Trocar:
```tsx
<DialogContent ref={dialogContentRef} hideOverlay className="max-w-2xl max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
  <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
    <DialogTitle>...</DialogTitle>
  </DialogHeader>
  <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-6">
```
por:
```tsx
<DialogContent
  ref={dialogContentRef}
  hideOverlay
  className="max-w-2xl w-[95vw] h-[85vh] p-0 grid grid-rows-[auto_1fr_auto] gap-0 overflow-hidden"
>
  <DialogHeader className="px-6 pt-6 pb-4 border-b">
    <DialogTitle>...</DialogTitle>
  </DialogHeader>
  <div className="overflow-y-auto px-6 py-4 space-y-6 min-h-0">
```
E o `<DialogFooter>` (linha ~411):
```tsx
<DialogFooter className="px-6 py-4 border-t bg-background">
```
(remover `shrink-0` — desnecessário no grid).

**`src/components/delivery/MenuTab.tsx`** — `SortableProductCard` (linha ~137)

O wrapper `<div className="flex gap-3 p-3 flex-1 min-w-0">` é flex-row dentro de Card flex-col. Substituir por:
```tsx
<div className="flex gap-3 p-3 flex-1 min-w-0 w-full">
```
e o bloco da direita (linha ~160):
```tsx
<div className="flex-1 min-w-0 flex flex-col overflow-hidden">
```
adicionando `overflow-hidden` para impedir que descrições muito longas empurrem badges para fora do card.

### Verificação

Após as edições, abrir `/pdv/delivery/cardapio` no navegador, abrir um modal de opção com muitos itens e confirmar:
1. Cards renderizam com texto truncado, badges visíveis no rodapé.
2. Modal de "Editar Opção" mostra header fixo, lista de itens rolável, e Salvar/Cancelar fixos no rodapé.