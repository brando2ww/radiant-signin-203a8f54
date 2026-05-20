## Ajuste de padding lateral em /pdv/fornecedores

A página de Cupons (`src/pages/pdv/delivery/Coupons.tsx`) usa o wrapper:

```tsx
<div className="px-4 py-6">
```

A página de Fornecedores (`src/pages/pdv/Suppliers.tsx`) hoje usa `container mx-auto p-6`, o que cria um padding lateral maior e centraliza com `max-width`.

### Alteração

- Em `src/pages/pdv/Suppliers.tsx`, trocar nos dois wrappers (loading e conteúdo principal, linhas 127 e 147):
  - de: `className="container mx-auto p-6 space-y-6"`
  - para: `className="px-4 py-6 space-y-6"`

Nenhuma outra mudança visual, de lógica ou de backend.
