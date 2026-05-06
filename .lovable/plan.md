## Contexto

O arquivo `src/components/pdv/ProductOptionDialog.tsx` não existe — as opções do produto no PDV são gerenciadas dentro de `src/components/pdv/ProductDialog.tsx` (na aba "Opções", via `PDVProductOptionsManager`). É justamente esse dialog que tem o problema descrito:

```tsx
<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
```

O `overflow-y-auto` está no container inteiro, então header e footer rolam junto e os botões "Cancelar/Salvar" somem quando há muitos itens.

(Observação: o `ProductOptionDialog.tsx` em `src/components/delivery/` já foi corrigido em iteração anterior com `flex flex-col overflow-hidden` + `shrink-0` no header/footer + `flex-1 min-h-0 overflow-y-auto` no meio. Vou aplicar o mesmo padrão aqui.)

## Mudanças em `src/components/pdv/ProductDialog.tsx`

**1. `DialogContent` (linha 327)** — trocar para layout flex de altura fixa, sem scroll global:

```tsx
<DialogContent className="max-w-2xl w-[95vw] h-[90vh] max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
```

**2. `DialogHeader` (linhas 328-335)** — fixo no topo:

```tsx
<DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
```

**3. Reestruturar o `<form>` (linha 337)** para também ser flex column ocupando 100%, e envolver as `Tabs` em um wrapper com scroll:

```tsx
<form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
  <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
    <Tabs defaultValue="basic">
      ...
    </Tabs>
  </div>

  <DialogFooter className="px-6 py-4 border-t bg-background shrink-0">
    ...
  </DialogFooter>
</form>
```

**4. `DialogFooter` (linha 998)** — fixo na base com borda:

```tsx
<DialogFooter className="px-6 py-4 border-t bg-background shrink-0">
```

## Resultado esperado

- Header com título "Editar/Novo Produto" sempre visível no topo.
- Conteúdo central (todas as abas: Básico, Preços, Receita, Opções, Fiscal) com scroll interno próprio.
- Botões "Cancelar" e "Salvar/Criar" sempre visíveis na base, mesmo com 10+ itens de opção cadastrados.
- A `TabsList` de 5 colunas continua dentro da área com scroll (rola junto com o conteúdo).