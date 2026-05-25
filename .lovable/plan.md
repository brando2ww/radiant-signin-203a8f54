## Estado colapsado do AdminSidebar

Atualmente, quando `isCollapsed = true`, o painel de detalhes (`w-[300px]`) anima para `w-0` e desaparece. A imagem de referência mostra que o painel colapsado deve permanecer visível como um **segundo rail estreito de ícones**, ao lado do rail principal.

### Mudanças em `src/components/super-admin/AdminSidebar.tsx`

1. **Largura colapsada**: trocar `w-0` por `w-[60px]` (mesma largura do rail principal) quando `isCollapsed = true`. Manter a transição com `cubic-bezier(0.25, 1.1, 0.4, 1)`.

2. **Conteúdo no estado colapsado**: ao invés de esconder tudo, renderizar uma coluna vertical de ícones:
   - **Topo**: botão chevron (apontando para cima/`ChevronUp`) que reexpande o painel ao clicar.
   - **Busca**: ícone `SearchIcon` dentro de um quadrado com borda arredondada (`rounded-lg border border-neutral-800`).
   - **Item ativo**: ícone `View` (olho) destacado com `bg-neutral-800 rounded-lg` — representa o "Overview" selecionado da seção atual.
   - **Lista de ícones**: extrair os ícones de cada `MenuItemT` da seção ativa (`getSidebarContent(activeSection)`) e renderizá-los empilhados verticalmente, centralizados, com cor `text-neutral-500` e hover `text-neutral-200`.
   - Cada ícone vira um botão clicável que, ao ser pressionado, expande o painel (`setIsCollapsed(false)`) e mantém o item correspondente em foco.

3. **Estado expandido**: nenhum comportamento muda — continua mostrando o painel completo de 300px com header, busca, seções e footer.

4. **Renderização condicional**: usar dois blocos JSX dentro do mesmo container animado:
   - `{isCollapsed ? <CollapsedRail /> : <ExpandedPanel />}`
   - O container externo controla apenas a largura via `style={{ width }}`.

### Detalhes visuais (baseado na referência)

- Espaçamento vertical entre ícones: `gap-4` aproximadamente.
- Chevron do topo: mesma área clicável do header expandido (toggle).
- Ícones renderizados em ~20px (`size={20}`).
- Sem labels de texto, sem chevrons de dropdown, sem footer card no modo colapsado.
- Borda/fundo do painel: mantém `rounded-2xl bg-neutral-950` e a borda externa do wrapper.

### Não muda

- Rail principal de 60px (logo + 7 ícones + settings + avatar).
- Lógica de `activeSection` e `expandedItems`.
- Tipos `MenuItemT`, `MenuSectionT`, `SidebarContent`.
- Nenhum outro arquivo (rotas, guard, layout).
