## Objetivo

Padronizar o menu do módulo **Avaliações** (`/pdv/avaliacoes/*`) para usar o mesmo padrão visual do módulo **Tarefas** (`/pdv/tasks`): sidebar vertical à esquerda no desktop e barra horizontal rolável no mobile, em vez do subnav superior atual com dropdowns.

## Mudanças

### 1. `src/pages/PDV.tsx`
- Remover a renderização do `<EvaluationsSubNav />` (linha ~95) e o import (linha 49).
- O menu passa a viver dentro do próprio layout das avaliações.

### 2. `src/pages/pdv/EvaluationsLayout.tsx`
- Substituir o wrapper atual (`<div className="flex flex-col">`) pelo mesmo shell do `Tasks.tsx`:
  - Container externo `flex min-h-[calc(100vh-3.5rem)]`.
  - Sidebar desktop: `<nav className="hidden md:flex flex-col w-52 shrink-0 border-r border-border bg-card p-3 gap-1">`.
  - Área de conteúdo: `<div className="flex-1 overflow-auto">` com a `<Suspense>` + `<Routes>` existentes (rotas inalteradas).
  - Nav mobile: `<nav className="flex md:hidden gap-2 overflow-x-auto ...">` igual à do Tasks.
- Itens do menu (flat, agrupados por seção visual com `SidebarGroupLabel`-style headings simples para acomodar o que hoje é dropdown):
  - **Geral**: Dashboard (`""`), Campanhas (`campanhas`), Arte para o caixa (`arte`), Configurações (`configuracoes`).
  - **Relatórios**: Diário, Semanal, Mensal.
  - **Clientes**: Painel, Gestão, Aniversariantes.
  - **Cupons**: Painel, Gestão, Validação, Sorteio, Roletas.
- Estado ativo via `useLocation()` comparando `location.pathname` com `\`/pdv/avaliacoes/${to}\`` (mesmo helper `fullPath` do `EvaluationsSubNav`).
- Estilos idênticos aos do Tasks: botão ativo `bg-primary text-primary-foreground shadow-sm`, inativo `text-card-foreground hover:bg-muted`, ícones `h-4 w-4`.
- Reaproveitar o array de itens com `icon` (Lucide) já usado no `EvaluationsSubNav` (LayoutDashboard, Megaphone, BarChart3, Users, Gift, Settings, Printer) + ícones das sub-rotas.

### 3. `src/components/pdv/evaluations/EvaluationsSubNav.tsx`
- Manter o arquivo (não excluir nesta etapa) caso seja referenciado em outro lugar; apenas deixa de ser montado. Confirmar via busca antes; se não houver outros usos, pode ser removido.

## Não muda

- Rotas, lazy imports, conteúdo das páginas, permissões.
- `EvaluationsPanel` (painel standalone `/avaliacoes/*`) continua com seu próprio header.
- Cores e tokens seguem o design system (sem cores hardcoded).

## Resultado

Layout idêntico ao de Tarefas: sidebar fixa de 208px à esquerda no desktop com itens agrupados, scroll horizontal de chips no mobile, e a área de conteúdo ocupando o restante.