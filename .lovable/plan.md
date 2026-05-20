## Corrigir congelamento ao cancelar Sheet de edição de fornecedor

### Causa

No `SupplierCard.tsx`, os itens **Editar** e **Excluir** são acionados de dentro de um `DropdownMenu` (Radix). Ao clicar, o Sheet/AlertDialog abre **enquanto** o dropdown ainda está fazendo seu unmount/cleanup de foco.

Resultado: quando o usuário fecha o Sheet (Cancelar / X / ESC / clique no overlay), o Radix deixa `pointer-events: none` aplicado ao `<body>` — a página fica visualmente normal, mas não responde a cliques (congelada).

Esse é exatamente o problema coberto pela memória **Dialog Standards** do projeto (defer dialog opening com `setTimeout 0`).

### Alteração (somente UI/eventos, sem mudança de lógica)

`src/components/pdv/SupplierCard.tsx`:

- Trocar os handlers dos `DropdownMenuItem`:
  - `onClick={() => onEdit(supplier)}` → `onSelect={(e) => { e.preventDefault(); setTimeout(() => onEdit(supplier), 0); }}`
  - `onClick={() => onDelete(supplier.id)}` → `onSelect={(e) => { e.preventDefault(); setTimeout(() => onDelete(supplier.id), 0); }}`

Usar `onSelect` (e não `onClick`) é o padrão Radix para itens de menu, e o `setTimeout 0` garante que o dropdown finalize o cleanup de foco/`pointer-events` antes do Sheet/AlertDialog montar.

### Reforço opcional no SupplierDialog

`src/components/pdv/SupplierDialog.tsx` — adicionar limpeza defensiva ao `onOpenChange` do `Sheet` para garantir que, em qualquer fechamento, `document.body.style.pointerEvents` seja restaurado:

```tsx
<Sheet
  open={open}
  onOpenChange={(o) => {
    onOpenChange(o);
    if (!o) {
      setTimeout(() => {
        document.body.style.pointerEvents = "";
      }, 100);
    }
  }}
>
```

Nenhuma alteração no formulário, validação, submit, hooks de dados ou banco.
