## Problema

Após a tentativa de aplicar `flex flex-col overflow-hidden` direto no `DialogContent` do `ProductDialog.tsx`, o scroll interno ainda não funciona. O `DialogContent` do shadcn (`src/components/ui/dialog.tsx`) renderiza com `grid w-full max-w-lg ... gap-4` e inclui um `<DialogPrimitive.Close>` posicionado absoluto. O `tailwind-merge` deveria resolver `grid` → `flex`, mas o componente `<Form>` do react-hook-form (Provider sem DOM) e o `<form>` real ficam disputando contexto de altura. Resultado: `flex-1 min-h-0` não tem altura efetiva para limitar o scroll.

## Solução

Não depender do layout flex direto no `DialogContent`. Criar um `div` wrapper interno que controla altura, flex e overflow — isolado dos estilos do Radix.

## Mudanças em `src/components/pdv/ProductDialog.tsx`

**1. `DialogContent` (linha 327)** — manter altura fixa, mas remover `flex flex-col` daqui:
```tsx
<DialogContent className="max-w-2xl w-[95vw] h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden">
```

**2. Adicionar wrapper interno** logo após `DialogContent` que define o layout flex de altura total:
```tsx
<div className="flex flex-col h-full max-h-full overflow-hidden">
  <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">...</DialogHeader>

  <div className="flex-1 min-h-0 overflow-y-auto">
    <Form {...form}>
      <form onSubmit={handleSubmit} id="pdv-product-form">
        <div className="px-6 py-4">
          <Tabs defaultValue="basic">...</Tabs>
        </div>
      </form>
    </Form>
  </div>

  <DialogFooter className="px-6 py-4 border-t bg-background shrink-0">
    <Button type="button" variant="outline" onClick={...}>Cancelar</Button>
    <Button type="submit" form="pdv-product-form" disabled={...}>...</Button>
  </DialogFooter>
</div>
```

**3. Mover o footer para fora do `<form>`** — usar `form="pdv-product-form"` no botão Salvar para que o submit continue funcionando, mantendo o footer fixo fora da área de scroll.

**4. Remover** as classes `flex-1 min-h-0 flex flex-col` do `<form>` e o div wrapper antigo `flex-1 min-h-0 overflow-y-auto px-6 py-4` que envolvia as Tabs (substituídos pela nova estrutura acima).

## Por que resolve

- O `div` wrapper com `h-full overflow-hidden flex flex-col` cria contexto de layout independente, fora do alcance do `grid`/`gap-4` do shadcn DialogContent.
- O scroll fica num `div` puro (não no `<form>`), eliminando o problema do `display: block` padrão do form.
- Footer fora do `<form>` + atributo `form="..."` no botão garante submit funcional sem participar do scroll.

## Validação

Abrir um produto na aba "Composição" ou "Opções" com 10+ itens — título e botões Cancelar/Salvar devem permanecer fixos enquanto o meio rola.