## Ajustes na página Gerenciar Cardápio (delivery)

Alvos: `src/components/delivery/MenuTab.tsx` (cards e grid) e `src/components/delivery/ProductDialog.tsx` (modal).

### 1. Cards de produto cortados — `MenuTab.tsx` (SortableProductCard)

Atualmente o card usa `flex gap-3 p-3` com texto à direita podendo transbordar e a linha de badges (preço + tempo + opções) frequentemente quebra além do espaço.

Mudanças no `<Card>`:
- Adicionar `h-full flex flex-col` para permitir esticar até a altura da linha do grid.
- Imagem: já está em `h-20 w-20 shrink-0`. Reforçar com `aspect-square` e wrapper `shrink-0` para nunca encolher/distorcer.
- Bloco de texto: já tem `flex-1 min-w-0`. Garantir `min-w-0` em todos os filhos com texto e manter `truncate` no nome e `line-clamp-2` na descrição.
- Linha de preço/badges: trocar para `mt-auto` para empurrar ao rodapé do card, mantendo `flex-wrap gap-2` e `min-w-0`.
- Garantir que o conteúdo da direita use `flex flex-col flex-1 min-w-0` para o `mt-auto` funcionar.

### 2. Grid em duas colunas desalinhado — `MenuTab.tsx` (SortableCategorySection)

Trocar:
```
<div className="grid gap-3 sm:grid-cols-2">
```
por:
```
<div className="grid gap-3 sm:grid-cols-2 auto-rows-fr items-stretch">
```

- `auto-rows-fr` força linhas com mesma altura.
- `items-stretch` (default) + `h-full` no Card alinha os cards.
- Como o Card sortable tem o conteúdo crescendo internamente, o último card de uma categoria com número ímpar ocupará apenas uma coluna (comportamento padrão de grid — não precisa de `col-span`).

### 3. Modal sem rolagem — `ProductDialog.tsx`

Atualmente: `<DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">` com header fixo, tabs e form rolando junto, sem rodapé fixo (o `DialogFooter` está dentro do form, então rola).

Refatorar para layout em 3 zonas (header / conteúdo rolável / footer fixo):

```
<DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
  <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
    <DialogTitle>...</DialogTitle>
  </DialogHeader>

  <Tabs ... className="flex-1 flex flex-col min-h-0">
    <TabsList className="mx-6 mt-4 grid grid-cols-3 shrink-0">...</TabsList>

    <TabsContent value="details" className="flex-1 min-h-0 flex flex-col mt-4">
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
          {/* todos os campos atuais */}
        </div>
        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
          <Button type="button" variant="outline" ...>Cancelar</Button>
          <Button type="submit" ...>Salvar</Button>
        </DialogFooter>
      </form>
    </TabsContent>

    <TabsContent value="recipe" className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 mt-4">
      {product && <DeliveryRecipeManager .../>}
    </TabsContent>

    <TabsContent value="options" className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 mt-4">
      <ProductOptionsManager productId={product?.id} />
    </TabsContent>
  </Tabs>
</DialogContent>
```

Pontos:
- Remove `overflow-y-auto` do DialogContent (que rolava o todo) e move scroll para o conteúdo interno de cada tab.
- Header e DialogFooter ficam fixos via `shrink-0` + `border-t/border-b`.
- `min-h-0` em cascata garante que o flex-1 efetivamente role.

### Resultado esperado

- Cards sempre alinhados, mesma altura, sem corte de imagem/texto/badges; o último de uma linha ímpar fica em uma coluna só.
- Modal de edição com header e botões Cancelar/Salvar sempre visíveis; campos longos (Ficha Técnica, Opções) acessíveis via scroll interno em qualquer resolução (1280/1440/1920).