## Ajustes no rail colapsado

Em `src/components/super-admin/AdminSidebar.tsx`, função `CollapsedRail`:

1. **Chevron**: trocar `ChevronUpIcon` por `ChevronRightIcon` (já importado). Remover import de `ChevronUpIcon`.
2. **Centralização vertical**: envolver os ícones (chevron + busca + lista de seção) em um wrapper com `my-auto` ou usar `justify-center` no container raiz (`flex h-full flex-col items-center justify-center gap-2`), removendo o `py-4` para que o grupo fique centralizado na altura total do painel.
