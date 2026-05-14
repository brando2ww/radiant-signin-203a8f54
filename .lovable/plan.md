## Diagnóstico

A tentativa anterior (`sticky top-14`) não funciona porque o `<main>` do PDV (`src/pages/PDV.tsx` linha 93) usa `flex-1 overflow-auto`, então o scroll acontece dentro do `<main>`, não do body. O `sticky` da sidebar é relativo a esse container, mas o header global está fora dele — `top-14` empurra a sidebar para fora da viewport.

A página de Avaliações resolve isso de outro jeito: o `<main>` recebe um modo especial (`h-[calc(100vh-3.5rem)] overflow-hidden`) e o `EvaluationsLayout` cria um flex de altura fixa com sidebar `h-full overflow-y-auto` e conteúdo `flex-1 h-full overflow-y-auto`. Assim a sidebar nunca rola.

Vou replicar exatamente esse padrão para `/pdv/tarefas`.

## Mudanças

### `src/pages/PDV.tsx`

- Trocar `const isEvaluations = pathname.startsWith("/pdv/avaliacoes")` por uma flag genérica que também ative para a rota raiz `/pdv/tarefas` (mantendo scroll padrão para `tarefas/checklists/...`):
  ```ts
  const isFixedHeight =
    pathname.startsWith("/pdv/avaliacoes") ||
    pathname === "/pdv/tarefas" || pathname === "/pdv/tarefas/";
  ```
- Usar `isFixedHeight` no `className` do `<main>`.

### `src/pages/pdv/Tasks.tsx`

Reestruturar o layout para espelhar `EvaluationsLayout`:

- Container raiz: `flex h-[calc(100vh-3.5rem)]` (em vez de `min-h-...`).
- Sidebar desktop: remover `sticky/top-14/max-h`, manter `hidden md:flex flex-col w-52 shrink-0 border-r border-border bg-card p-3 gap-1 h-full overflow-y-auto`.
- Área de conteúdo: `flex-1 min-w-0 h-full overflow-y-auto` com padding interno.
- Mover `<ResponsivePageHeader>` para dentro da área de conteúdo (já está).
- Nav mobile: manter no topo da área de conteúdo, sem `sticky`, com `border-b bg-card` (igual ao EvaluationsLayout).

### Sem mudanças em

- Itens de menu, lógica de `activeSection`, `renderContent()`.
- Rotas filhas (`tarefas/checklists/novo`, `tarefas/checklists/:id`) continuam usando o `<main>` com scroll padrão.

## Resultado

A sidebar de Tarefas/Checklists fica realmente fixa enquanto o conteúdo rola, idêntico ao módulo de Avaliações.