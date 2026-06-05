# Correção do Módulo de Fidelidade do Delivery

Plano executado em fases para não quebrar o que já funciona. Cada fase é uma migration + ajustes de código.

---

## Fase 1 — Trigger de acúmulo no banco (base de tudo)

**Migration:**
- Adicionar coluna `expires_at timestamptz NULL` em `delivery_loyalty_points` (já preparando fase 7).
- Adicionar coluna `points_expire_days int NOT NULL DEFAULT 0` em `delivery_loyalty_settings` (0 = não expira).
- Criar índice único parcial em `(user_id, customer_id, reference_id, type)` para garantir idempotência por pedido.
- Criar função `public.earn_points_for_order(_order_id uuid)` SECURITY DEFINER:
  - Lê `delivery_orders` (user_id, customer_id, total, status).
  - Sai sem erro se status ≠ `completed`, customer_id nulo, ou settings inativa.
  - Lê `points_per_real` e `points_expire_days` das settings do owner.
  - Calcula `points = floor(total * points_per_real)`.
  - INSERT com `reference_id = order_id`, `type = 'earn'`, `expires_at` calculado, e `ON CONFLICT DO NOTHING` no índice acima.
- Criar trigger `AFTER UPDATE OF status ON delivery_orders` que chama a função quando `NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'`.
- Criar função/trigger de **estorno**: quando pedido passa de `completed` para `cancelled`, inserir linha negativa `type='refund'` com `reference_id = order_id || ':refund'` (idempotente).

**Código:**
- Remover chamada de `useEarnPoints` em `OrderConfirmation.tsx` (acúmulo passa a ser server-side).
- Manter o hook só para uso administrativo manual (ajustes pontuais pelo dono).

---

## Fase 2 — Fechar RLS de `delivery_loyalty_points`

**Migration:**
- DROP das policies `Public can view loyalty points` e `Anon can insert loyalty points`.
- Manter apenas:
  - SELECT para owner (`auth.uid() = user_id`) e staff (`is_establishment_member(user_id)`).
  - ALL para `service_role`.
- Revogar `GRANT INSERT, SELECT` de `anon` na tabela; manter SELECT para `authenticated` (dono/staff via RLS).
- Toda leitura/escrita do lado público passa por RPCs SECURITY DEFINER (fases seguintes).

---

## Fase 3 — Sessão OTP do cliente público

**Migration — nova tabela `delivery_customer_otp_sessions`:**
- Campos: `id`, `user_id` (tenant), `customer_id`, `phone`, `code_hash`, `expires_at`, `verified_at`, `session_token` (uuid), `session_expires_at`, `attempts int default 0`, `created_at`.
- RLS: bloqueada para anon/authenticated; somente RPC/service_role.
- GRANTs apenas para service_role.
- Setting nova em `delivery_loyalty_settings`: `otp_session_minutes int DEFAULT 30`.

**Edge functions (Lovable Cloud):**
- `loyalty-send-otp` — recebe `{ slug, phone }`, resolve tenant via `resolve_business_slug`, cria/atualiza customer (RPC existente), gera código 6 dígitos, salva hash (`crypto.subtle`), envia via WhatsApp (Evolution API já integrada no projeto) ou fallback SMS. Rate-limit por telefone (1 código a cada 60s, máx 5/h).
- `loyalty-verify-otp` — recebe `{ slug, phone, code }`, valida hash + expiração + attempts, emite `session_token` com TTL `otp_session_minutes`, retorna `{ session_token, customer_id, expires_at }`.

**RPCs SECURITY DEFINER (consultadas pelo frontend público com `session_token`):**
- `loyalty_get_balance(_session_token uuid)` → retorna saldo + pontos a vencer em 30d.
- `loyalty_get_history(_session_token uuid)` → últimas 50 linhas.
- Ambas validam token vivo na tabela de sessões antes de retornar.

**Código:**
- Refatorar `LoyaltyIdentifyDialog` → wizard 2 passos (telefone → código).
- Criar hook `usePublicLoyaltySession` que guarda `session_token` em `sessionStorage` (não localStorage) com expiração.
- `PublicMenuLoyalty` passa a chamar as RPCs novas em vez de `useCustomerPoints`/`useCustomerPointsHistory`.
- Sem token válido: tela pede identificação; nenhum dado é mostrado.

---

## Fase 4 — Resgate de cashback com validação server-side

**Migration — RPC `redeem_cashback(_session_token uuid, _order_id uuid, _points int)`:**
- Valida sessão OTP e resolve `customer_id` + `user_id` a partir dela.
- Lê saldo via SUM dentro da transação (FOR UPDATE em pseudo-lock: `pg_advisory_xact_lock(hashtext(customer_id::text))`).
- Se `saldo < _points` → `RAISE EXCEPTION 'insufficient_points'`.
- INSERT linha negativa com `type='redeem'`, `reference_id = _order_id`.
- Retorna `{ new_balance }`.

**Código:**
- Substituir `useRedeemPoints` (INSERT direto) por chamada à RPC.
- Remover INSERT direto do frontend público.

---

## Fase 5 — `redeem_loyalty_prize` exige sessão OTP

**Migration:**
- Alterar assinatura: `redeem_loyalty_prize(_session_token uuid, _prize_id uuid)`.
- Resolver `customer_id` + `user_id` da sessão; rejeitar com `authentication_required` se inválida.
- Manter validações atuais (estoque, saldo, etc.).
- Manter versão antiga apenas se houver chamadas internas autenticadas; senão DROP.

**Código:**
- `useRedeemLoyaltyPrize` passa `session_token`.

---

## Fase 6 — Visibilidade de staff (gestor)

**Código (sem migration):**
- Em `useCustomerRanking` e `useRedemptionHistory` (`src/hooks/use-delivery-loyalty.ts`), substituir `.eq("user_id", user.id)` por filtro pelo resultado de uma chamada a `pdv_resolve_owner` (já temos `useEstablishmentId` que faz exatamente isso). Trocar para `useEstablishmentId()` e usar esse valor como filtro.
- Mesma troca em `useLoyaltySettings` e `useLoyaltyPrizes` quando chamados sem `userId` no painel admin.

---

## Fase 7 — Expiração de pontos

**Migration:**
- (Coluna `expires_at` já criada na Fase 1.)
- Criar função `expire_loyalty_points()` SECURITY DEFINER:
  - Para cada linha `earn` com `expires_at < now()` que ainda não tem estorno, inserir linha `type='expire'` com pontos negativos equivalentes ao saldo remanescente daquela origem; `reference_id = original_id || ':expire'` para idempotência.
- Habilitar `pg_cron` + `pg_net` (se não já habilitados).
- Agendar cron diário às 03:00 chamando uma edge function `loyalty-run-expiration` que invoca a função SQL (insert tool, pois usa anon key específica).

**UI:**
- Em `PublicMenuLoyalty`: mostrar badge "X pontos vencem em até 30 dias" usando o campo já retornado por `loyalty_get_balance`.
- Em `LoyaltySettings` (admin): input "Pontos expiram após (dias) — 0 = não expiram".

---

## Detalhes técnicos importantes

- **Idempotência**: todos os créditos/débitos automáticos usam `reference_id` único e índice parcial para evitar duplicidade em retentativas.
- **Race conditions**: resgates usam `pg_advisory_xact_lock` por customer.
- **Segurança de sessão**: `session_token` é UUID aleatório armazenado server-side; nunca expõe `customer_id` cru no client antes de OTP.
- **Rate-limit OTP**: contadores por telefone + IP nos edge functions.
- **Compatibilidade**: pedidos já criados antes do trigger não são creditados retroativamente (decisão de produto — pode ser feito backfill manual via SQL se desejado).

---

## Pedidos PDV/Garçom (item 8)

Resolvido automaticamente pela Fase 1: o trigger dispara em qualquer `UPDATE` de `delivery_orders.status = 'completed'`, independente da origem. Pedidos de salão (`pdv_orders`) **não** entram no escopo desta fase — se for desejado pontuar vendas de salão também, é trabalho adicional fora deste plano.

---

## Ordem de entrega

1. Fase 1 (trigger + estorno + coluna expires_at)
2. Fase 2 (fechar RLS)
3. Fase 4 (RPC resgate cashback)
4. Fase 3 (OTP + refactor público)
5. Fase 5 (prêmio com OTP)
6. Fase 6 (staff visibility)
7. Fase 7 (cron de expiração + UI)

Cada fase é uma migration aprovável separadamente; o módulo continua funcional entre elas (com exceção da janela curta entre Fase 2 e Fase 3, em que a página pública pede reidentificação — comportamento esperado).