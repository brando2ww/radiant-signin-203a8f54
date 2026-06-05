# Finalização do Módulo de Fidelidade

Conclui os 3 itens restantes da auditoria de Fidelidade do Delivery.

## 1. Cron diário de expiração (Fase 7)

**Edge function** `supabase/functions/loyalty-run-expiration/index.ts`:
- Recebe POST simples, valida header `x-cron-secret` contra `Deno.env.get('CRON_SECRET')`.
- Cria client com `SUPABASE_SERVICE_ROLE_KEY` e chama `supabase.rpc('expire_loyalty_points')`.
- Retorna `{ ok: true, expired_count }`. Loga erros.
- Idempotência: garantida pela própria `expire_loyalty_points()` (já usa `NOT EXISTS` para não duplicar linhas `type='expire'` por `reference_id`).

**Secret novo**: `CRON_SECRET` (gerado aleatório) — adicionar via `secrets--add_secret` antes de agendar.

**Agendamento (via `supabase--insert`, não migration, porque contém URL/anon key específicos do projeto)**:
```sql
select cron.schedule(
  'loyalty-expire-points-daily',
  '0 6 * * *', -- 03:00 BRT = 06:00 UTC
  $$ select net.http_post(
    url:='https://frbziqazwhymwsrtneoy.supabase.co/functions/v1/loyalty-run-expiration',
    headers:='{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>","apikey":"<ANON>"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);
```
Migration leve antes para garantir `pg_cron` e `pg_net` habilitados.

## 2. Campos no painel admin (`LoyaltySettings.tsx`)

Adicionar dois inputs numéricos no formulário existente:

- **"Pontos expiram após (dias)"** → `points_expire_days` (min 0). Helper: *"0 = pontos nunca expiram. Recomendado: 180."*
- **"Sessão do cliente (minutos)"** → `otp_session_minutes` (min 5, default 30). Helper: *"Tempo que o cliente fica autenticado após validar o código por WhatsApp."*

Incluir nos defaults do form, no payload do mutation existente (`useUpdateLoyaltySettings`) e no schema de validação se houver. Sem mudança de hook — campos já existem em `delivery_loyalty_settings`.

## 3. Remover componentes legados

`LoyaltyBanner.tsx` e `LoyaltyRedeemSheet.tsx` aparecem apenas como auto-referência (sem importadores). Confirmar com `rg "from.*LoyaltyBanner|from.*LoyaltyRedeemSheet"` e, se zero resultados, deletar ambos os arquivos. Caso reste alguma referência, substituir pelo fluxo novo de `LoyaltyIdentifyDialog` + `PublicMenuLoyalty` antes da remoção.

## Ordem de execução

1. Editar `LoyaltySettings.tsx` (item 2 — sem risco).
2. Deletar legados (item 3) após `rg` final.
3. Criar edge function + secret `CRON_SECRET`.
4. Migration p/ habilitar `pg_cron`/`pg_net`.
5. `supabase--insert` com `cron.schedule` usando o secret real.
6. Validar: invocar a function manualmente via `curl_edge_functions` e conferir linhas `type='expire'` em `delivery_loyalty_points`.
