# Endurecimento de rotas — role + módulo + tokens públicos

A boa notícia: a infraestrutura existe (`useUserRole.canAccess`, `RouteModuleGuard`, `MODULE_ROUTES`). Falta plugar no `ProtectedRoute` e validar tokens nas rotas públicas.

## 1. `ProtectedRoute` — checar role + módulo

Arquivo: `src/components/ProtectedRoute.tsx`.

- Manter checagem de `user` e redirecionamento de super admin.
- Adicionar:
  - `const { canAccess, defaultRoute, isLoading: roleLoading } = useUserRole();`
  - Enquanto `roleLoading`, exibir o mesmo loader.
  - `const path = useLocation().pathname;`
  - Se `!canAccess(path)` → `<Navigate to={defaultRoute} replace />`.
- Envolver `children` em `<RouteModuleGuard>` para também bloquear módulo desabilitado pelo tenant (mostra `ModuleUnavailable`).

Resultado: garçom navegando para `/pdv/financeiro/...` é redirecionado para `/garcom`; tenant sem módulo "tarefas" abrindo `/pdv/tarefas` vê a tela "Módulo não disponível".

Sub-rotas já refinadas em `ROLE_SCOPE` cobrem o pedido do usuário:
- `garcom` → `/garcom`, `/pdv/salao`, `/pdv/comandas` (não acessa financeiro/relatórios/configurações).
- `caixa` → `/pdv/caixa` (atua como "operador").
- `gerente` → todos os módulos do tenant, exceto `/admin` (super_admin).
- `proprietario` → tudo do tenant.
- `super_admin` → permanece tratado por `SuperAdminGuard` em `/admin/*`.

Pequeno ajuste em `ROLE_SCOPE` (`src/hooks/use-user-role.ts`):
- Renomear semanticamente sem quebrar dados: manter `caixa` como o "operador" do pedido (Frente de Caixa + delivery pedidos). Adicionar `/pdv/delivery/pedidos` a `caixa.subRoutes`.
- `gerente` ganha `subRoutes` opcional `undefined` (já cobre tudo dos módulos) — sem mudança.
- Documentar via comentário que “admin” do pedido = `proprietario`/`gerente` nesta base.

## 2. Rotas públicas `/tarefas/:userId` e `/c/:checklistId`

Continuam sem `ProtectedRoute` (acesso por QR). A defesa fica na página + servidor:

- `src/pages/PublicTasks.tsx`: já recebe `userId` da URL. Adicionar checagem inicial que valida se o `userId` corresponde a um establishment público válido via RPC `security definer` (a criar). Se inválido → tela de "Link inválido".
- `src/pages/PublicChecklistAccess.tsx`: já lida com token do checklist; adicionar validação explícita do `checklistId` via RPC antes de permitir marcar tasks.
- Toda mutação de tarefas/itens deve passar por **edge functions service-role** que recebem `(userId|checklistId, token, payload)` e validam antes de gravar. Esses endpoints serão criados na sequência (fora desta migration de policies):
  - `public-tasks-load`, `public-tasks-toggle`
  - `public-checklist-load`, `public-checklist-toggle`

Com a migration RLS aplicada anteriormente (operational_task_instances já fechado a `authenticated`), o acesso anônimo direto do supabase-js para de funcionar — as páginas públicas passarão a chamar essas edge functions. Esta etapa apenas garante o **bloqueio no frontend** + roteia chamadas para as edge functions.

## 3. Loader/UX

`ProtectedRoute` hoje mostra um loader full-screen. Reaproveitar o mesmo enquanto `useUserRole` carrega para evitar flicker entre `/pdv/...` e redirect.

## Arquivos editados

- `src/components/ProtectedRoute.tsx` — usar `useUserRole` + `RouteModuleGuard`.
- `src/hooks/use-user-role.ts` — pequeno ajuste em `caixa.subRoutes`.
- `src/pages/PublicTasks.tsx` — validar `userId` via RPC e migrar mutations para edge function.
- `src/pages/PublicChecklistAccess.tsx` — idem para `checklistId`.

## Fora deste plano (follow-up)

- Edge functions `public-tasks-*` e `public-checklist-*` (serão criadas junto ao deploy de RLS para não quebrar QR Codes em campo).
- RPC `validate_public_tasks_userid(uuid)` e `validate_checklist_token(uuid, text)`.
