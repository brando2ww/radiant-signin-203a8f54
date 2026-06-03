## Mudança

**`src/components/pdv/PDVHeaderNav.tsx`** — Promover Avaliações e Tarefas para seções próprias no `sectionItems`, em vez de itens dentro de "Administrador".

- Remover as entradas `Avaliações` e `Tarefas` da seção `Administrador`.
- Adicionar duas novas seções no array (após `Administrador`):
  - `{ title: "Avaliações", icon: Star, items: [{ title: "Avaliações", url: "/pdv/avaliacoes", icon: Star }] }`
  - `{ title: "Tarefas", icon: ClipboardCheck, items: [{ title: "Tarefas", url: "/pdv/tarefas", icon: ClipboardCheck }] }`

Como o componente já trata seções com 1 item filtrado como link direto (sem dropdown), aparecerão como "Avaliações" e "Tarefas" diretamente no header. Para tenants que tenham `pdv`, ainda continuam exibindo o módulo deles normalmente (Administrador continua existindo com os demais itens) — mas Avaliações/Tarefas passam a ter destaque próprio em qualquer combinação.