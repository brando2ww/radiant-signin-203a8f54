## Reconstruir o componente exatamente como o original

Vou reescrever `src/components/super-admin/AdminSidebar.tsx` reproduzindo fielmente o componente colado e a captura de tela enviada — mesmas cores escuras, mesma marca "Interfaces", mesmos textos em inglês, mesmos 8 conteúdos (Dashboard, Tasks, Projects, Calendar, Teams, Analytics, Files, Settings) com todos os sub-itens decorativos, mesmo card "Text content" no rodapé, mesmo easing `cubic-bezier(0.25, 1.1, 0.4, 1)`.

O código colado tem o JSX corrompido pelo paste, então vou reconstruir o markup a partir da captura de tela:

- Rail `w-[60px]` preto puro, com logo "Interfaces" quadrado em SVG inline (paths `p15853b70` / `p35081d00` / `p1a3cd600`), 7 ícones de navegação (`Dashboard`, `Task`, `Folder`, `CalendarIcon`, `UserMultiple`, `Analytics`, `DocumentAdd`), divisor, ícone de `SettingsIcon` e avatar circular no fim.
- Painel direito `w-[280px]` com cantos arredondados (`rounded-2xl`), fundo `bg-neutral-950`, header "Interfaces" + ícone, título da seção (ex. "Dashboard") com chevron de colapso à direita, campo de busca com borda fina, seções com label cinza em caps, itens com ícone + chevron quando têm dropdown, item "Overview" destacado com fundo `bg-neutral-800`.
- Card de rodapé com avatar circular, texto "Text content" e botão `⋯` (três pontinhos verticais via SVG).
- Animação de colapso do painel via `style={{ width, transition }}` com o easing exato.
- Estado interno: `activeSection` (default `"dashboard"`), `expandedItems: Set<string>`, `isCollapsed: boolean`. Cliques em sub-itens só fazem `console.log` (igual ao original).

### Decisões

- **Sem wireing com rotas reais**: o componente fica 100% como o original, decorativo. O rail muda só o `activeSection` interno; nenhum `useNavigate`/`useLocation`.
- **Sem `useAuth`/`signOut`**: o original não tem.
- **Sem tokens do design system**: o original usa cores `neutral-*` hardcoded e fonte `Lexend` — vou manter exatamente assim, pois o usuário pediu "EXATAMENTE ISSO". Isso conflita com a memória global de design, mas a instrução explícita do usuário tem prioridade.
- **Logo "Interfaces"**: mantido literal (não Velara), como na captura.
- **Idioma**: inglês, como no código original.

### Arquivos

- **Editar** `src/components/super-admin/AdminSidebar.tsx` — reescrita completa reconstruindo o JSX do componente colado, incluindo o objeto `svgPaths`, `InterfacesLogoSquare`, `BrandBadge`, `AvatarCircle`, `SearchContainer`, `IconNavButton`, `IconNavigation`, `SectionTitle`, `DetailSidebar`, `MenuItem`, `SubMenuItem`, `MenuSection`, `TwoLevelSidebar` e o export `Frame760` (mantido para preservar a API original) + um `export const AdminSidebar = Frame760` para não quebrar o import em `SuperAdmin.tsx`.

### Fora de escopo

- Não mexer em `SuperAdmin.tsx`, `SuperAdminGuard`, rotas ou outros componentes.
- Não criar páginas para os itens decorativos.
- Não conectar busca, dropdowns de filhos ou navegação — fica 100% decorativo, igual ao original.
