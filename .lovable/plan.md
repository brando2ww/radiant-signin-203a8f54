Mover "Gerenciar Integrações" (`/pdv/integracoes`) de uma seção própria para dentro da seção **Administrador** no header.

## Mudança
**`src/components/pdv/PDVHeaderNav.tsx`**
- Remover o bloco da seção `Integrações` em `sectionItems`.
- Adicionar `{ title: "Integrações", url: "/pdv/integracoes", icon: Plug }` ao final da lista de items da seção `Administrador`.

Sem mudanças de rotas, permissões ou backend.