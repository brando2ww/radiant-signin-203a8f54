## Substituir conteúdo fake por opções reais do admin

Em `src/components/super-admin/AdminSidebar.tsx`:

### Rail (lateral 60px)
Trocar `navItems` por 4 itens reais com rotas:
- Dashboard → `/admin` (ícone `Dashboard`)
- Tenants → `/admin/tenants` (ícone `UserMultiple`)
- Planos → `/admin/planos` (ícone `Folder`)
- Configurações → `/admin/configuracoes` (ícone `SettingsIcon`)

Usar `useNavigate` + `useLocation` (react-router-dom) para navegar e marcar ativo. Remover o botão Settings duplicado de baixo (vira item normal). Manter logo + avatar.

### Painel de detalhes (`getSidebarContent`)
Substituir as 8 seções fake (dashboard/tasks/projects/calendar/teams/analytics/files/settings) por 4 mapeadas às seções reais, todas em pt-BR. Todos os subitens navegam via `onItemClick`.

- **dashboard** — título "Dashboard"
  - Visão geral → Resumo (`/admin`)
  
- **tenants** — título "Tenants"
  - Gestão → Todos os tenants (`/admin/tenants`), Novo tenant (`/admin/tenants/novo`)
  
- **planos** — título "Planos"
  - Gestão → Listar planos (`/admin/planos`)
  
- **configuracoes** — título "Configurações"
  - Conta → Configurações gerais (`/admin/configuracoes`)

Remover todos os `hasDropdown`/`children` decorativos e ícones de seção que não correspondem a rotas reais. Manter os tipos `MenuItemT`/`MenuSectionT` mas adicionar `path?: string` opcional para navegação.

### Conexão de navegação
- `MenuItem.onItemClick` passa `item.path` para `navigate(path)`.
- `item.isActive` calculado por `location.pathname === item.path` (ou `startsWith` para subrotas).
- `activeSection` derivado de `location.pathname` (não mais state).

### Rail colapsado
`CollapsedRail` continua mostrando os ícones dos `items` da seção ativa (que agora são poucos e reais), mantém chevron-right e centralização vertical.

Sem outras mudanças (footer "Text content", logo Interfaces, busca decorativa permanecem como estão).
