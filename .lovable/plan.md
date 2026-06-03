# Correções — Isolamento por tenant no painel de Avaliações

Dois problemas distintos, ambos com a mesma raiz: itens "globais" que ignoram o tenant.

## 1. Dashboard mostra 269 cupons que não pertencem ao usuário

**Causa:** `src/hooks/use-dashboard-stats.ts` → `useDashboardCoupons` consulta `campaign_prize_wins` sem filtro de tenant. A tabela não tem `user_id`, então o filtro precisa vir via JOIN com `evaluation_campaigns.user_id`.

**Correção:**
- Trocar a query para incluir `evaluation_campaigns!inner(user_id)` e filtrar por `evaluation_campaigns.user_id = visibleUserId` (vindo de `useEstablishmentId`).
- Retornar 0 quando `visibleUserId` ainda não estiver carregado (em vez de `throw`).
- Revisar também `useBirthdayCount` (já recebe `evaluationsData` filtrado, OK).

**Validação por RLS (defesa em profundidade):** confirmar com `supabase--linter` que `campaign_prize_wins` tem policy SELECT do tipo `EXISTS (SELECT 1 FROM evaluation_campaigns ec WHERE ec.id = campaign_prize_wins.campaign_id AND ec.user_id = auth.uid())`. Se não tiver, criar migration ajustando (sem alterar dados existentes).

## 2. Menu mostra páginas de módulos não contratados

**Causa:** `src/lib/access/module-routes.ts` declara como `ALWAYS_ALLOWED_ROUTES`:
`/pdv/dashboard`, `/pdv/produtos`, `/pdv/configuracoes`, `/pdv/usuarios`, `/pdv/integracoes`, `/pdv/clientes`.

Resultado: tenant que só tem `avaliacoes` ainda vê Administrador (Dashboard, Produtos, Clientes, Usuários, Configurações, Integrações) e a seção Integrações inteira.

Além disso, vários itens do menu Administrador (Produtos, Estoque, Fornecedores, Compras, Relatórios, etc.) não têm rota mapeada em `MODULE_ROUTES` e caem em `moduleForRoute → null → return true` no `itemAllowed`, ficando sempre visíveis.

**Correção em `module-routes.ts`:**
- Esvaziar `ALWAYS_ALLOWED_ROUTES` (apenas rotas de infraestrutura tipo `/pdv/dashboard` se existir tela de "sem módulo"; preferência: lista vazia).
- Mover para o módulo `pdv` as rotas que hoje são "always":
  `/pdv/produtos`, `/pdv/configuracoes`, `/pdv/usuarios`, `/pdv/integracoes`, `/pdv/clientes`, `/pdv/dashboard`.
- Acrescentar ao `MODULE_ROUTES.pdv` as rotas administrativas que faltam, para não cairem no fallback "true":
  `/pdv/produtos`, `/pdv/centros-producao`, `/pdv/configuracoes`, `/pdv/usuarios`, `/pdv/integracoes`, `/pdv/clientes`, `/pdv/dashboard`.
- Manter `/pdv/avaliacoes` no módulo `avaliacoes` (já está).

**Correção em `PDVHeaderNav.tsx`:**
- `itemAllowed`: quando `moduleForRoute` retorna `null`, considerar **bloqueado** (não permitido) — política de allowlist em vez de denylist. Hoje retorna `true`, o que faz qualquer rota não mapeada vazar.
- Adicionar a dependência `tenantId` (do `useUserModules`) no `useMemo` para o menu atualizar quando o tenant carregar.

**Resultado esperado para o tenant atual (só `avaliacoes`):**
- Some o dropdown "Administrador" inteiro, exceto o item "Avaliações" — que pode ser realocado para uma seção própria ou continuar sob Administrador filtrado a 1 item. Decisão: manter dentro de Administrador (a seção fica com apenas "Avaliações") OU exibir um link direto. Para minimizar mudanças visuais, manter no Administrador (seção com 1 item).
- Some "Frente de Caixa", "Delivery", "Financeiro", "Integrações".

## 3. Rota default quando só `avaliacoes` está ativo

Hoje `useUserRole.defaultRoute` para `proprietario` é `/pdv/dashboard`. Com `/pdv/dashboard` virando rota do módulo `pdv`, o proprietário deste tenant não tem acesso → o `canAccess` falha → cai no fallback `activeModules()[0] === 'avaliacoes' ? '/avaliacoes' : roleDefault`.

Ajustar o fallback para: se `pdv` não estiver ativo mas `avaliacoes` estiver, redirecionar para `/avaliacoes` (painel standalone). Isso evita o usuário cair no `/pdv/dashboard` bloqueado e ver tela vazia.

Também ajustar `useUserModules.getDefaultModuleRoute` da mesma forma.

## Arquivos alterados

- `src/hooks/use-dashboard-stats.ts` — filtrar por `visibleUserId` via JOIN com `evaluation_campaigns`.
- `src/lib/access/module-routes.ts` — esvaziar `ALWAYS_ALLOWED_ROUTES` e mover rotas administrativas para o módulo `pdv`.
- `src/components/pdv/PDVHeaderNav.tsx` — `itemAllowed` retorna `false` quando rota não mapeada; incluir `tenantId` nas deps do `useMemo`.
- `src/hooks/use-user-role.ts` — corrigir `defaultRoute` para preferir `/avaliacoes` quando apenas esse módulo estiver ativo.
- `src/hooks/use-user-modules.ts` — mesma lógica em `getDefaultModuleRoute`.
- Migration (se o linter indicar): SELECT policy de `campaign_prize_wins` baseada em `evaluation_campaigns.user_id = auth.uid()`.

## Riscos

- Tenants antigos sem `tenant_id` resolvido: `useUserModules.hasModule` retorna `true` por padrão (legado), então nada quebra para esses.
- Esvaziar `ALWAYS_ALLOWED_ROUTES` pode afetar telas de configuração para tenants que tenham apenas avaliações; intencional — eles passam a ser tratados pelo módulo `pdv`.
- Verificar com o linter Supabase se há policies já cobrindo `campaign_prize_wins`; só criar migration se faltar.
