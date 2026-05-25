## Novo Sidebar de duas camadas para `/admin`

Substitui o `AdminSidebar` atual por um sidebar de dois níveis: rail vertical de ícones (~60px) + painel detalhado colapsável (~260px). Acesso continua via `SuperAdminGuard` (tabela `super_admins`).

### Dependência
- Instalar `@carbon/icons-react`.

### Estrutura

**Rail de ícones** (fixo, sempre visível):
- Topo: símbolo Velara (já existe em `src/assets/velara-symbol.png`)
- Itens (4): Dashboard, Tenants, Planos, Configurações
- Base: avatar do usuário + botão Sair

**Painel detalhado** (colapsável via chevron no topo):
- Header com título da seção ativa
- Busca (decorativa)
- Seções com sub-itens — links reais quando existem, ou rótulos informativos:
  - **Dashboard** → "Visão geral" (link `/admin`), "Métricas rápidas" (estatísticas)
  - **Tenants** → "Todos tenants" (`/admin/tenants`), "Novo tenant" (`/admin/tenants/novo`)
  - **Planos** → "Gerenciar planos" (`/admin/planos`)
  - **Configurações** → "Perfil", "Segurança", "Notificações" (placeholders por enquanto)

Cada item tem ícone Carbon + label; itens com sub-itens usam dropdown animado (chevron).

### Arquivos

1. **`src/components/super-admin/AdminSidebar.tsx`** — reescrever do zero:
   - Layout `flex` com rail (`w-[60px]`) + painel (`w-[260px]` ou `w-0` quando colapsado, com `transition-[width] duration-200`)
   - Cores via tokens: `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `hover:bg-muted/50`
   - Active state: `bg-muted text-foreground`
   - Ícones do `@carbon/icons-react` (Dashboard, UserMultiple, Document, Settings, ChevronDown, Search, Logout)
   - Estado interno: `activeSection` (sincronizado com `location.pathname`) e `isCollapsed`
   - Clicar num ícone do rail navega para a primeira rota da seção e troca o painel

2. **`src/pages/SuperAdmin.tsx`** — remover `SidebarProvider` / `SidebarTrigger` (não usados mais), renderizar `<AdminSidebar />` direto + `<main>` com `flex-1`. Adicionar rota `configuracoes`.

3. **`src/pages/super-admin/AdminSettings.tsx`** (novo) — página placeholder simples com seções Perfil / Segurança / Notificações (apenas títulos e descrições, sem lógica).

### Fora de escopo
- Não criar funcionalidade real de Configurações (só placeholder).
- Não mexer em outros sidebars (PDV, Garçom).
- Sem busca funcional, só campo decorativo.
- Sem alterações no `SuperAdminGuard` ou na tabela `super_admins` — o usuário Adm@adm.com.br já deve estar registrado lá.
