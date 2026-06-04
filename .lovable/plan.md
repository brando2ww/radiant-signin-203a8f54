# Correção de RLS — Isolamento Multi-Tenant (LGPD)

Objetivo: eliminar todas as políticas `USING(true)` em tabelas sensíveis e completar políticas incompletas que quebram funcionalidades (2FA, integrações de tenant, user_roles).

Será criada **uma única migration consolidada** com `DROP POLICY IF EXISTS` + `CREATE POLICY` para cada item, para permitir revisão atômica antes de aplicar.

## Etapa 1 — Exploração (antes de escrever SQL)

Ler as migrations citadas e as tabelas envolvidas para confirmar:
- Nome exato das policies atuais (para o `DROP POLICY IF EXISTS`).
- Nome da coluna de owner em cada tabela (`user_id`, `establishment_id`, `owner_user_id`).
- Existência de colunas referenciadas (ex.: `delivery_customers.establishment_id`, `pdv_print_jobs.establishment_id`, `campaign_prize_wins.establishment_id`).
- Como o frontend público (cliente final delivery, `/c/:checklistId`, evolução do iFood) hoje grava nessas tabelas — para não quebrar fluxo legítimo anônimo.
- Função `is_establishment_member` e `pdv_resolve_owner` já existentes (reutilizar).

Se alguma coluna esperada não existir (ex.: `delivery_customers.establishment_id`), a migration precisará primeiro criar a coluna + backfill antes de aplicar a policy. Esses ajustes serão incluídos na migration consolidada.

## Etapa 2 — Migration consolidada

### 1. `whatsapp_session_context`
- DROP da policy `FOR ALL USING(true)`.
- CREATE policy `FOR ALL TO authenticated USING(auth.uid() = user_id) WITH CHECK(auth.uid() = user_id)`.

### 2. `delivery_customers`
- Garantir coluna `establishment_id uuid` (criar + backfill via `delivery_orders` se faltar).
- DROP policies abertas para `anon`/`authenticated`.
- Authenticated: `USING(establishment_id = auth.uid() OR is_establishment_member(establishment_id))`.
- Acesso público do cliente final será feito **via edge function service-role** (não via policy `anon` aberta). Plano lista isso como follow-up no código que hoje grava como `anon`.

### 3. `delivery_addresses`
- DROP `FOR ALL USING(true)`.
- Authenticated: `USING(customer_id IN (SELECT id FROM delivery_customers WHERE establishment_id = auth.uid() OR is_establishment_member(establishment_id)))`.
- Mesma estratégia: gravação pública via edge function.

### 4. `delivery_orders`
- DROP policies abertas (migrations 20251027170759 e 20260506182750).
- Authenticated: `USING(user_id = auth.uid() OR is_establishment_member(user_id))` para SELECT/UPDATE/DELETE.
- Cliente final consulta seu pedido por **token** via RPC `security definer` (criar `get_delivery_order_by_token(token text)`), não por policy `anon`.
- Manter o trigger `delivery_guard_customer_confirmation` (já restringe campos quando `auth.uid() IS NULL`).

### 5. `delivery_order_items` / `delivery_order_item_options`
- DROP policies abertas.
- Authenticated: `USING(order_id IN (SELECT id FROM delivery_orders WHERE user_id = auth.uid() OR is_establishment_member(user_id)))`.
- Inserção do cliente final → mover para edge function service-role.

### 6. `pdv_print_jobs`
- DROP policies `anon`.
- Authenticated SELECT/UPDATE: `USING(establishment_id = auth.uid() OR is_establishment_member(establishment_id))`.
- Bridge de impressão local autentica com token de device → continuará lendo via edge function service-role (sem policy `anon`).

### 7. `operational_task_instances`
- DROP policies `anon USING(true)`.
- Authenticated: `USING(user_id = auth.uid() OR is_establishment_member(user_id))`.
- Acesso público (`/c/:checklistId`, `/tarefas/:userId`) → RPCs `security definer` que validam o token do checklist antes de ler/atualizar.

### 8. `campaign_prize_wins`
- DROP INSERT aberto e SELECT aberto.
- INSERT: somente via edge function/RPC `security definer` (sorteio público precisa validar campanha + token).
- Authenticated SELECT: `USING(campaign_id IN (SELECT id FROM evaluation_campaigns WHERE user_id = auth.uid() OR is_establishment_member(user_id)))`.

### 9. `pdv_ifood_webhooks`
- DROP INSERT `WITH CHECK(true)`.
- INSERT: somente `service_role` (edge function `ifood-webhook`). Revogar `INSERT` de `anon`/`authenticated`.

### 10. `user_settings`, `business_settings`, `delivery_settings`, `delivery_loyalty_*`
- Para cada tabela: DROP policies abertas; CREATE `FOR ALL TO authenticated USING(user_id = auth.uid()) WITH CHECK(user_id = auth.uid())`.
- `business_settings` mantém SELECT público restrito por `slug` via RPC `resolve_business_slug` já existente — não abrir policy `anon` ampla.
- `delivery_settings`: continuar permitindo leitura pública do horário/área no menu via edge function ou view restrita a colunas não sensíveis (se já consumido no frontend público, criar view `delivery_settings_public`).

### 11. Políticas faltantes

- `user_roles`:
  - INSERT/UPDATE/DELETE: `USING(is_super_admin())` (apenas super admin gerencia papéis).
  - SELECT já restrito ao próprio usuário — manter.
- `two_factor_codes`:
  - INSERT: `WITH CHECK(auth.uid() = user_id)` (corrige 2FA quebrado em runtime).
  - UPDATE (marcar `used_at`): manter via service_role (edge `verify-2fa-code`).
- `tenant_integrations`:
  - Adicionar SELECT `TO authenticated USING(user_id = auth.uid() OR is_super_admin())`.

## Etapa 3 — Verificação

1. Rodar `supabase--linter` após a migration; confirmar que os 13 `USING(true)` somem.
2. Validar manualmente fluxos críticos:
   - Cliente final cria pedido no `/cardapio/<slug>` (deve continuar funcionando via edge function service-role).
   - 2FA envia + verifica código.
   - Bridge de impressão consome `pdv_print_jobs`.
   - Checklist público `/c/:checklistId` lê/atualiza tasks.
   - Super admin lista `user_roles` e `tenant_integrations`.
3. Listar follow-ups de código (edge functions a criar/ajustar) — não fazem parte desta migration mas ficam mapeados para o próximo build.

## Detalhes técnicos

- Toda policy nova usa `TO authenticated` explícito; `anon` só permanece em tabelas/colunas comprovadamente públicas (cardápio, página de avaliação pública etc.).
- Reutilizar `public.is_establishment_member(owner_id)` e `public.is_super_admin()` para evitar recursão de RLS.
- Onde o cliente final hoje insere direto via `anon` (delivery, checklist, sorteio), o código frontend será migrado para chamar edge functions `service_role` em uma etapa de build subsequente. Esta migration **já fecha** o acesso direto; portanto os fluxos públicos afetados precisarão das edge functions correspondentes prontas no mesmo deploy. Plano de build separado cobrirá: `public-create-delivery-order`, `public-confirm-delivery-order`, `public-checklist-execute`, `public-prize-draw`.
- Migration usa `DROP POLICY IF EXISTS` por nome — exploração da etapa 1 confirmará nomes exatos.
- Nenhum `GRANT` será removido; apenas policies. As tabelas já têm grants corretos.

## Riscos

- Se aplicarmos as policies antes das edge functions públicas, fluxos do cliente final quebram. Mitigação: a etapa de build seguinte (fora deste plano) entrega as edge functions; a migration pode ser aplicada junto.
- `delivery_customers.establishment_id` pode não existir hoje — backfill incluído na migration; se múltiplos restaurantes atendem o mesmo telefone, criar registros duplicados por establishment (1 cliente por restaurante).
