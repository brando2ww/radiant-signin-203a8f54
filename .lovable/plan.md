# Remover OTP do módulo de Fidelidade e usar login Supabase

Substitui o fluxo OTP por WhatsApp pela autenticação padrão já existente (`supabase.auth` — e-mail/senha ou Google). Identidade do cliente passa a vir de `auth.uid()` → `delivery_customers.auth_user_id`.

## 1. Banco (migration única)

**Drop**:
- `loyalty_send_otp` / `loyalty_verify_otp` / `loyalty_resolve_session` (funções)
- Tabela `delivery_customer_otp_sessions`
- Colunas `otp_session_minutes`, `last_sent_at` em `delivery_loyalty_settings` (e `otp_session_minutes` em settings)

**Recriar 4 RPCs `SECURITY DEFINER` sem `_session_token`**:

Helper interno:
```sql
-- retorna customer_id ligado ao usuário autenticado para o estabelecimento (_user_id = dono do cardápio)
create or replace function loyalty_current_customer(_owner uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from delivery_customers
   where auth_user_id = auth.uid() and user_id = _owner
   limit 1
$$;
```

- `loyalty_get_balance(_user_id uuid)` → resolve `customer_id` via helper; se `auth.uid()` nulo ou cliente não existe → `{ balance: 0, authenticated: false }`. Senão soma `delivery_loyalty_points`.
- `loyalty_get_history(_user_id uuid)` → mesmo padrão, retorna lista.
- `redeem_cashback(_user_id uuid, _order_id uuid, _points int)` → exige `auth.uid()`; valida saldo com `pg_advisory_xact_lock(hashtext(customer_id::text))`; insere `type='redeem'`.
- `redeem_loyalty_prize(_user_id uuid, _prize_id uuid)` → idem; valida estoque + saldo; insere `type='redeem'` e decrementa estoque.

Todas verificam `auth.uid() is not null` (retornam erro `authentication_required` se anônimo). Grant para `anon, authenticated` (anon recebe `authenticated:false`).

## 2. Frontend

**Deletar**:
- `src/hooks/use-public-loyalty-session.ts`
- `src/components/public-menu/LoyaltyIdentifyDialog.tsx`

**`src/hooks/use-delivery-loyalty.ts`** — remover `session_token` dos 4 hooks (`useCustomerBalance`, `useCustomerHistory`, `useRedeemCashback`, `useRedeemLoyaltyPrize`). Cada hook passa apenas `_user_id` (dono do cardápio). Adicionar guard: se `useAuth()` não tem `user`, hook fica desabilitado.

**`src/pages/PublicMenuLoyalty.tsx`**:
- Remover `usePublicLoyaltySession` e `LoyaltyIdentifyDialog`.
- Usar `useAuth()` (contexto já existente).
- Se `!user` → renderizar card com mensagem "Faça login para ver seus pontos" + botão que abre `CustomerLogin` (já usado no checkout) em um Dialog, com tabs para login/cadastro existentes.
- Se `user` mas sem `delivery_customers` linkado para esse estabelecimento → mensagem "Faça seu primeiro pedido neste cardápio para começar a acumular".
- Se autenticado e linkado → mostra saldo/histórico/prêmios como hoje.

## 3. Edge functions

Deletar `supabase/functions/loyalty-send-otp` e `supabase/functions/loyalty-verify-otp` (arquivos + `supabase--delete_edge_functions`).

## 4. Ordem de execução

1. Editar `PublicMenuLoyalty.tsx` + hooks para usar nova assinatura.
2. Deletar `LoyaltyIdentifyDialog`, `use-public-loyalty-session`.
3. Migration (drop tabela/funções OTP + recriar 4 RPCs sem session_token).
4. Remover edge functions OTP via tool.
5. Validar manualmente no preview: rota `/cardapio/:slug/meus-pontos` deslogado → CTA de login; logado → saldo.

## Notas

- A coluna `delivery_customers.auth_user_id` já existe e tem RLS configurada (migration `20260527181353`).
- O CTA de login reusa `CustomerLogin` (`src/components/public-menu/checkout/CustomerLogin.tsx`) que já faz `signInWithPassword`. Se for necessário cadastro também, adicionar tab de signup análoga (`signUp` com `emailRedirectTo: window.location.origin`).
- Cliente só vê pontos do estabelecimento atual (resolve `_user_id` via slug, já feito em `PublicMenuLoyalty`).
