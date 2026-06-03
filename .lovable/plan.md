## Acelerar logout

O `await supabase.auth.signOut()` faz uma requisição de rede para revogar o token globalmente — em redes lentas trava o botão por alguns segundos antes de redirecionar.

### Estratégia
Usar `signOut({ scope: "local" })` (instantâneo, só limpa storage local) + navegar imediatamente. Disparar a revogação global em background (fire-and-forget) para invalidar refresh tokens no servidor sem bloquear a UI.

### Mudanças

1. **`src/contexts/AuthContext.tsx`** (`signOut`):
   - Limpar `user/session/profile` imediatamente.
   - `await supabase.auth.signOut({ scope: "local" })` (rápido, apenas storage).
   - Disparar `supabase.auth.signOut({ scope: "global" }).catch(() => {})` sem await.

2. **`src/components/super-admin/AdminSidebar.tsx`** (`UserMenu.handleSignOut`):
   - Trocar `await supabase.auth.signOut()` por `supabase.auth.signOut({ scope: "local" })` com `await` curto, navegar logo em seguida, e disparar global em background.
   - Como alternativa mais simples: chamar o `signOut` do `useAuth()` em vez de duplicar a lógica.

3. **`src/components/pdv/PDVUserMenu.tsx`** e **`src/pages/evaluations/EvaluationsSettings.tsx`**: trocar a chamada direta por `useAuth().signOut()` para reaproveitar o comportamento rápido.

### Não muda
- Comportamento de redirecionamento.
- Fluxo de auth state change listener.
- Outras telas que já usam `useAuth().signOut()` (ModuleGuard, ModuleUnavailable, GarcomActionFab) ganham a melhoria automaticamente.