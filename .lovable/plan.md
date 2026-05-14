## Sidebar fixa no módulo de Avaliações

Tornar o menu lateral do `EvaluationsLayout` fixo (sticky) ao rolar o conteúdo, sem afetar o layout em mobile.

### Mudança

`src/pages/pdv/EvaluationsLayout.tsx`:

- **Container externo** (`flex min-h-[calc(100vh-3.5rem)]`): manter — já garante altura mínima da viewport menos o header h-14.
- **Sidebar desktop** (`<nav className="hidden md:flex ... w-52 ...">`): trocar para fixar via `sticky`:
  - Adicionar `sticky top-14 self-start h-[calc(100vh-3.5rem)]`
  - `top-14` alinha logo abaixo do header global (3.5rem = h-14)
  - `self-start` impede o flex-stretch de descolar o sticky
  - `h-[calc(100vh-3.5rem)]` mantém o `overflow-y-auto` interno do nav funcional caso a lista de itens cresça
  - `overflow-y-auto` já existente é preservado para scroll interno do menu
- **Área de conteúdo**: remover `overflow-auto` do wrapper `<div className="flex-1 overflow-auto">`, deixando apenas `flex-1 min-w-0`. O scroll passa a ser da janela (necessário para que `sticky` funcione — `overflow-auto` no pai cria contexto de rolagem que quebra o sticky).
- **Mobile nav**: continua como está (rolagem horizontal, sem sticky vertical).

### Resultado

Ao rolar a página dentro de qualquer subrota de `/pdv/avaliacoes/*`, o menu lateral desktop permanece visível, fixado abaixo do header. Mobile mantém o comportamento atual.
