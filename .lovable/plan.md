Os menus do header não abrem porque o wrapper `<div className="flex-1 min-w-0 overflow-hidden">` em `src/pages/PDV.tsx` recorta o `NavigationMenuContent` (que é absoluto). Como o cluster da direita já é `shrink-0` e os labels só aparecem em ≥xl, basta remover o `overflow-hidden`.

## Mudança
**`src/pages/PDV.tsx`**: trocar `<div className="flex-1 min-w-0 overflow-hidden">` por `<div className="flex-1 min-w-0">`.