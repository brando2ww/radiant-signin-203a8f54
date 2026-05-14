## Objetivo

Atualmente, em `/pdv/tarefas`, o menu lateral de seções (Painel, Checklists, Agendamento, Equipe, etc.) rola junto com a página. No módulo de Avaliações o menu permanece visível porque está dentro de um header `sticky top-0`. Quero replicar esse comportamento no módulo de Tarefas/Checklists, mantendo o layout vertical já validado.

## Mudanças

### `src/pages/pdv/Tasks.tsx`

1. **Sidebar desktop fixa**: adicionar `sticky top-14 self-start max-h-[calc(100vh-3.5rem)] overflow-y-auto` à `<nav>` desktop (linha 92) para que ela acompanhe a rolagem mas permaneça visível abaixo do header global de altura `h-14`.
2. **Container raiz**: trocar `overflow-auto` da área de conteúdo (linha 115) por scroll natural da página, garantindo que o `sticky` do sidebar funcione (o scroll precisa ser do `body`, não do filho).
3. **Nav mobile sticky**: tornar a `<nav>` mobile (linha 122) `sticky top-14 z-30 bg-background -mx-4 px-4 py-2 border-b` para o mesmo efeito em telas pequenas.

### Sem mudanças em

- Estrutura/ordem dos itens do menu.
- Lógica de `activeSection` ou roteamento.
- Componentes filhos renderizados em `renderContent()`.

## Resultado esperado

Ao rolar qualquer seção (ex.: Checklists com muitos cards, Logs, Evidências), o menu lateral continua visível e clicável, igual ao header sticky de Avaliações.