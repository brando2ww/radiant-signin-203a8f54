## Sidebar Super Admin — coluna única

Remover o rail de ícones da esquerda (`IconNavigation`) e consolidar tudo em uma única coluna (a atual da direita) com todas as opções de navegação.

**Arquivo:** `src/components/super-admin/AdminSidebar.tsx`

### Mudanças

1. **`TwoLevelSidebar`**: remover `<IconNavigation />`, deixar apenas `<DetailSidebar />` ocupando toda a largura. Renomear opcionalmente para `SingleSidebar` (sem quebrar o export `AdminSidebar`).

2. **`getSidebarContent`**: deixar de depender de `activeSection`. Retornar uma única estrutura com todas as seções navegáveis em uma só lista:
   - **Visão geral**: Resumo (`/admin`)
   - **Tenants**: Todos os tenants (`/admin/tenants`), Novo tenant (`/admin/tenants/novo`)
   - **Planos**: Listar planos (`/admin/planos`)
   - **Configurações**: Configurações gerais (`/admin/configuracoes`)
   
   Cada item mantém seu ícone (Dashboard, UserMultiple, AddLarge, Folder, SettingsIcon) e flag `isActive` calculado por `pathname`.

3. **`DetailSidebar`**: 
   - Mover o `UserMenu` (botão de logout/avatar) para o rodapé da coluna, já que ele estava só no rail removido. Adicionar bloco fixo no fim com avatar + nome/sair.
   - Manter `BrandBadge`, `SectionTitle` (título "Administração"), `SearchContainer` e o scroll de seções.
   - Remover/limpar `activeSection` prop (não é mais necessária).

4. **Remover código morto**: `IconNavigation`, `IconNavButton`, `railItems`, `getActiveSectionFromPath`, `velaraSymbol` import.

5. **Manter colapsável**: o botão de colapsar continua funcionando (vira rail estreito com ícones de todos os itens). Sem mudanças no `CollapsedRail`.

### Não muda

- Comportamento de roteamento, rotas, guards.
- Layout fora do sidebar (`SuperAdmin.tsx`).
- Componentes do dashboard.