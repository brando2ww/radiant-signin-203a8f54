## Diagnóstico

Edu Venzor cadastrou um tenant que tem apenas o módulo `avaliacoes`. Pelo painel `/avaliacoes`, ele clicou em um card do dashboard que aponta para `/pdv/avaliacoes/clientes/gestao` (definido em `DashboardKPICards.tsx`). Resultado: tela "Módulo não disponível — pdv".

**Causa raiz:** `src/pages/PDV.tsx` envolve toda a shell `/pdv/*` em `<ModuleGuard module="pdv">` (linha 86). Assim, mesmo `/pdv/avaliacoes`, `/pdv/tarefas` e `/pdv/financeiro` — que pertencem a outros módulos — exigem o módulo `pdv` ativo no tenant.

Já temos o sistema certo (`canAccess` em `useUserRole` + `moduleForRoute` em `module-routes.ts`) cuidando de cada rota individualmente. O guard externo é redundante e quebra o caso multi-módulo.

Efeito colateral: se removermos o guard, um `proprietario` cujo tenant não tem `pdv` cairá no redirect `<Navigate to={defaultRoute}/>` apontando para `/pdv/dashboard` (default fixo do papel), que será negado por `canAccess` → loop. Precisamos derivar a rota inicial do **primeiro módulo ativo do tenant** quando o default do papel não estiver acessível.

## Mudanças

### 1. `src/pages/PDV.tsx`
- Remover `<ModuleGuard module="pdv">` ao redor da shell. Manter `RoleRoute` por rota — já valida módulo via `canAccess`.
- Importar `useUserModules` e calcular `effectiveDefault`: se `canAccess(defaultRoute)` for falso, usar `getDefaultModuleRoute()`. Aplicar nesse `<Route index>` e nos redirects do `RoleRoute`.

### 2. `src/hooks/use-user-role.ts`
- Em `defaultRoute`, devolver `getDefaultModuleRoute()` (via `useUserModules`) quando a rota default do papel não estiver entre os módulos ativos do tenant. Isso evita que `Index.tsx` mande o usuário para uma rota proibida ao logar.

### 3. `src/components/evaluations/dashboard/DashboardKPICards.tsx` (sem mudança)
- Os links `to="/pdv/avaliacoes/..."` continuam funcionando após (1), porque `moduleForRoute("/pdv/avaliacoes")` resolve para `avaliacoes` e o tenant tem esse módulo.

## Fora do escopo
- Reformular `DashboardKPICards` para usar rotas relativas (`/avaliacoes/...`) no painel standalone — funcional, mas exigiria duplicar todas as sub-rotas em `EvaluationsPanel.tsx`. Evitamos por ora.
- Filtragem de itens da `PDVHeaderNav` por módulo — já usa `canAccess`, herdará o comportamento correto automaticamente.

## Verificação
- Login como tenant só com `avaliacoes`: clicar nos cards do dashboard deve abrir `/pdv/avaliacoes/clientes/gestao`, `/pdv/avaliacoes/cupons/gestao` etc., sem ver "Módulo não disponível".
- Login como tenant com `pdv` completo: nada muda.
- Login como tenant sem `pdv`: redirect inicial vai para a primeira rota do módulo ativo, sem loop.