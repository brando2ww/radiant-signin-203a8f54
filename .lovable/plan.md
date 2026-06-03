# Isolamento por Tenant e Controle de Acesso por Módulo

## Objetivo
Garantir que cada tenant cadastrado no Super Admin seja um estabelecimento totalmente isolado (dados + acesso), com módulos liberados individualmente refletindo no menu e nas rotas.

---

## 1. Mapeamento de rotas → módulos (fonte única da verdade)

Atualizar `src/lib/access/module-routes.ts`:

- **Sempre liberadas** (infra básica, não dependem de módulo):
  `/pdv/dashboard`, `/pdv/produtos`, `/pdv/configuracoes`, `/pdv/usuarios`, `/pdv/integracoes`, `/pdv/clientes` (CRM básico)
- **pdv**: `/pdv/salao`, `/pdv/caixa`, `/pdv/comandas`, `/pdv/estoque`, `/pdv/fornecedores`, `/pdv/centros-producao`, `/pdv/compras`, `/pdv/relatorios`, `/pdv/venda-a-prazo`, `/pdv/funcionarios-consumo`, `/garcom`
- **delivery**: `/pdv/delivery`
- **financeiro**: `/pdv/financeiro`
- **avaliacoes**: `/pdv/avaliacoes`, `/avaliacoes`
- **tarefas**: `/pdv/tarefas`
- **fiscal** (novo módulo): `/pdv/notas-fiscais`, `/pdv/cupons-fiscais`
- **franquia** (novo módulo): `/pdv/franquia`
- **crm**: `/pdv/crm`

Adicionar `'fiscal'` e `'franquia'` ao enum `UserModule` e ao `app_module` no banco (migration).

Criar helper `isAlwaysAllowed(path)` separado de `moduleForRoute(path)`.

---

## 2. Página "Módulo não disponível"

Criar `src/pages/ModuleUnavailable.tsx`:
- Ícone de cadeado, título, descrição
- Mostra nome do módulo bloqueado e plano atual (via `useUserModules`)
- Botão "Falar com suporte" → WhatsApp/e-mail configurável
- Usada pelo `ModuleGuard` em vez do toast/redirect atual

Atualizar `src/components/ModuleGuard.tsx` para renderizar essa página em vez de redirecionar silenciosamente.

---

## 3. Guard global de rotas

Criar `src/components/RouteModuleGuard.tsx` que envolve todo conteúdo `/pdv/*`:
- Lê pathname atual
- Se `isAlwaysAllowed(path)` → libera
- Se `moduleForRoute(path)` → checa `hasModule(mod)` → libera ou mostra `ModuleUnavailable`
- Se rota desconhecida → redireciona para `getDefaultModuleRoute()`

Aplicar em `src/pages/PDV.tsx` envolvendo o `<Routes>` (substituindo o `ModuleGuard` outer removido anteriormente, mas agora dinâmico por rota). Aplicar lógica equivalente em `EvaluationsPanel` e `Garcom`.

---

## 4. Menu dinâmico

Refatorar `src/components/pdv/PDVHeaderNav.tsx`:
- Cada item de menu declara seu módulo (`module: UserModule | 'always'`)
- Filtrar itens e seções inteiras com base em `hasModule()` antes de renderizar
- Esconder dropdowns sem nenhum item visível (Delivery, Financeiro, etc.)
- Reavaliar reativamente quando `useUserModules` invalidar (já é React Query)

---

## 5. Logout do Super Admin → tela de login

Confirmar no `AdminSidebar` que logout chama `supabase.auth.signOut()` e navega para `/` (ou `/auth`). Verificar que `Index.tsx` exibe tela de login quando não autenticado.

---

## 6. Auditoria de isolamento de dados (backend)

### 6.1 RLS coverage
Rodar `supabase--linter` e listar tabelas operacionais sem RLS ou sem políticas por `user_id` / `establishment_owner_id`. Para cada gap, criar migration:
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Políticas usando `auth.uid() = user_id OR public.is_establishment_member(user_id)`

Tabelas a auditar (prioridade):
`pdv_products, pdv_orders, pdv_comandas, pdv_comanda_items, pdv_customers, pdv_ingredients, pdv_suppliers, pdv_financial_transactions, pdv_cashier_sessions, pdv_cashier_movements, delivery_orders, delivery_products, delivery_customers, delivery_drivers, delivery_coupons, evaluation_campaigns, evaluation_responses, checklists, daily_tasks, fiscal_invoices, fiscal_coupons, tenant_modules, establishment_users` e demais.

### 6.2 GRANTs
Verificar GRANTs para `authenticated` / `service_role` em todas as tabelas do `public` schema (não conceder a `anon` exceto rotas públicas).

### 6.3 Edge Functions
Auditar todas em `supabase/functions/*`:
- Confirmar uso de `auth.getUser(token)` para resolver chamador
- Toda operação cross-tenant exige checagem `is_super_admin()` (apenas no Super Admin)
- Funções de tenant filtram explicitamente por `user_id` do chamador
- Nunca expor `service_role` ao frontend

### 6.4 Queries do frontend
Buscar `supabase.from(` sem `.eq('user_id', ...)` em hooks. Padrão: usar `useEstablishmentId()` para obter o `visibleUserId` (dono do estabelecimento) e filtrar todas as queries por ele. Listar e corrigir gaps.

---

## 7. Rotas públicas — confirmar isolamento por parâmetro

Revisar:
- `/cardapio/:userId` e `/cardapio/:userId/meus-pontos` → queries filtram por `userId` da URL
- `/avaliacao/:campaignId` → resolve apenas a campanha e seu tenant
- `/tarefas/:userId`, `/c/:checklistId` → mesmo princípio

RLS dessas tabelas com leitura pública precisa exigir match com o parâmetro (ex.: `is_public = true` + filtro por id). Auditar e ajustar policies.

---

## 8. App do garçom

Garantir que `Garcom` usa `useEstablishmentId()` → `establishment_owner_id` em todas as queries de mesas/comandas/produtos, e que rotas dentro de `/garcom` também passam por `RouteModuleGuard` (módulo `pdv`).

---

## 9. Super Admin isolado

- `SuperAdminGuard` já checa via `is_super_admin()`. Confirmar que nenhuma rota `/admin/*` é alcançável sem essa role
- Queries de listagem cross-tenant devem rodar em Edge Functions com service role (já é o padrão para `create-tenant` etc.); auditar `useTenants` e similares para garantir que selects diretos no front respeitam RLS de super admin (policy `is_super_admin()` nas tabelas globais)

---

## 10. Plano de execução (ordem)

1. Migration: adicionar módulos `fiscal` e `franquia` ao enum
2. Atualizar `module-routes.ts` com mapeamento completo + always-allowed
3. Criar `ModuleUnavailable.tsx` e refatorar `ModuleGuard.tsx`
4. Criar `RouteModuleGuard.tsx` e aplicar em `PDV.tsx` / `Garcom.tsx` / `EvaluationsPanel.tsx`
5. Refatorar `PDVHeaderNav.tsx` para menu dinâmico
6. Auditoria RLS via linter → migrations corretivas (lote único)
7. Auditoria de hooks/queries no frontend → correções
8. Auditoria de Edge Functions → correções
9. QA manual: login com tenants diferentes confirma isolamento e menu correto

---

## Detalhes técnicos

- `UserModule` type: adicionar `'fiscal' | 'franquia'`
- Enum DB `app_module`: `ALTER TYPE app_module ADD VALUE 'fiscal'; ADD VALUE 'franquia';`
- `RouteModuleGuard` usa `useLocation()` + `useUserModules()`; mostra skeleton enquanto `isLoading`
- `ModuleUnavailable` aceita prop `module?: UserModule` para mensagem contextual
- Menu: cada `NavItem` ganha campo `requiredModule?: UserModule`; seções (dropdowns) filtradas — se vazias, escondidas
- Suporte: número de WhatsApp em env var `VITE_SUPPORT_WHATSAPP`

## Riscos

- Mudanças de RLS podem quebrar telas existentes → testar por role após cada migration
- Adicionar valores ao enum `app_module` requer rodar em transação separada antes de uso
- Esconder itens de menu pode confundir usuários atuais sem comunicação prévia
