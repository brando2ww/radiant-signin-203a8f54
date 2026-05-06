## Correções remanescentes — Gerenciar Cardápio

### 1. Cards ainda cortando conteúdo

Causa: o `<Card>` é o item do CSS Grid e não tem `min-w-0`. Grid items têm `min-width: auto` por padrão, então quando há texto longo (descrições/badges), a coluna estoura e o conteúdo fica cortado pelo `overflow-hidden` do Card.

Arquivo: `src/components/delivery/MenuTab.tsx` — `SortableProductCard` (~linha 132).

Mudança: adicionar `min-w-0` ao className do `<Card>`:
```
"overflow-hidden transition-shadow h-full flex flex-col min-w-0"
```

### 2. Modal "Editar Opções e Complementos" sem scroll

Arquivo: `src/components/delivery/ProductOptionDialog.tsx` (linha 188).

Estado atual:
```
<DialogContent ref={dialogContentRef} hideOverlay className="max-w-2xl max-h-[90vh] overflow-y-auto">
  <DialogHeader>...</DialogHeader>
  <div className="space-y-6">{/* todos os campos */}</div>
  <DialogFooter>...</DialogFooter>
</DialogContent>
```

O `overflow-y-auto` está no DialogContent, mas o conteúdo cresce muito (lista dinâmica de itens) e em algumas alturas a rolagem não dispara como esperado e os botões Cancelar/Salvar somem.

Refatorar para o mesmo padrão usado no `ProductDialog` (header e footer fixos, conteúdo do meio rolável):

```
<DialogContent
  ref={dialogContentRef}
  hideOverlay
  className="max-w-2xl max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden"
>
  <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
    <DialogTitle>...</DialogTitle>
  </DialogHeader>

  <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-6">
    {/* todo o conteúdo atual: Nome da Opção, Tipo, Min/Max, lista de Itens etc. */}
  </div>

  <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
    <Button onClick={handleSubmit}>{option ? "Salvar" : "Criar Opção"}</Button>
  </DialogFooter>
</DialogContent>
```

Garante que botões fiquem sempre visíveis e a lista de itens da opção role internamente.

### Resultado esperado

- Cards do cardápio admin sem cortar texto/badges, mesmo com descrições longas (line-clamp-2 continua mantendo até 2 linhas).
- Modal de edição de Opções e Complementos com header e botões Cancelar/Salvar sempre visíveis; lista de itens rola internamente.