## Transição suave entre os logos da AdminSidebar

Hoje a troca entre `<Logo>` (expandido) e símbolo (colapsado) é instantânea e parece travada porque o sidebar leva ~200ms para animar a largura, enquanto o logo já trocou.

### Mudança em `src/components/super-admin/AdminSidebar.tsx`

1. Renderizar **ambos** os logos sempre montados, sobrepostos via wrapper `relative` com `min-h-16`.
2. Controlar visibilidade por `opacity` + `scale` com `transition-all duration-200 ease-out`:
   - Expandido: símbolo `opacity-0 scale-90 pointer-events-none`, logo cheio `opacity-100 scale-100`.
   - Colapsado: inverso.
3. O símbolo fica posicionado `absolute inset-0 m-auto` (centralizado no header colapsado), logo cheio também `absolute inset-0` no estado expandido.
4. Adicionar `transition-[padding] duration-200` no `SidebarHeader` para acompanhar a animação do sidebar.

### Fora de escopo
- Não alterar `Logo` global nem outras sidebars.
- Sem novas keyframes — usar utilitários Tailwind existentes (`transition-all`, `opacity`, `scale`).
