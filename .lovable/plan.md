# Migração de localStorage para o banco

## Item 1 — `src/lib/active-order-storage.ts` (NÃO migrar)

Apesar do nome, este storage **não** guarda o pedido ativo do PDV. Ele é usado apenas em:

- `src/components/public-menu/CheckoutFlow.tsx` — após o cliente final finalizar o pedido no cardápio público
- `src/components/public-menu/checkout/OrderTrackingView.tsx` — tela "Acompanhar pedido" do cliente
- `src/hooks/use-active-order.ts` — hook que lê este id

O fluxo PDV (garçom/caixa) já é 100% no banco: itens em `pdv_comanda_items`, comandas em `pdv_comandas`, mesas em `pdv_tables`, com sincronização via Supabase Realtime (`catalog-realtime-sync`). Não há divergência entre tablet do garçom e o caixa — o "active order" deste arquivo é apenas para o navegador do cliente final lembrar qual pedido está acompanhando.

**Recomendação:** não mexer. Renomear opcionalmente para `customer-tracking-storage.ts` para evitar confusão futura. Migrar para o banco seria pior: exigiria que o cliente final tivesse conta/sessão.

Se você ainda assim quiser persistir no banco (vinculado ao telefone do cliente, por exemplo), me confirme e eu incluo no plano.

## Item 2 — Meta do super-admin (`AdminMetricsGrid.tsx`)

Migrar a chave `admin:goal:new-tenants` para o banco.

**Nova tabela `public.admin_settings`:**

| coluna | tipo | descrição |
|---|---|---|
| `id` | uuid PK | |
| `key` | text UNIQUE | ex.: `new_tenants_goal` |
| `value` | jsonb | valor flexível |
| `updated_by` | uuid | super admin que alterou |

- RLS: SELECT/INSERT/UPDATE/DELETE apenas para `is_super_admin()`.
- GRANTs para `authenticated` e `service_role`.

**Frontend:**

- Novo hook `useAdminSetting(key)` com React Query — retorna `{ value, setValue }`.
- `AdminMetricsGrid.tsx`: trocar `useState`+`localStorage` por `useAdminSetting('new_tenants_goal')`. Default 5 quando vazio.

## Item 3 — Status de impressoras (`ProductionCentersTab.tsx`)

Hoje cada navegador testa a impressora local (bridge `http://localhost:7777`) e guarda o resultado em `printer-status-<id>`. Faz sentido ser **por dispositivo**, não global no banco — uma impressora USB conectada ao tablet do garçom não existe no notebook do gerente.

**Proposta:** persistir por dispositivo no banco usando `pdv_device_config` (já existe e identifica o dispositivo via token de ativação).

**Migração:**

- Nova tabela `public.pdv_printer_status` com `device_id` (FK `pdv_device_config`), `production_center_id` (FK `pdv_production_centers`), `is_online` bool, `last_tested_at` timestamptz, `last_error` text, UNIQUE(`device_id`, `production_center_id`).
- RLS: dono do device (via `pdv_device_config.user_id = auth.uid()` ou `is_establishment_member`).
- GRANTs para `authenticated` e `service_role`.

**Frontend:**

- Novo hook `usePrinterStatus(deviceId)` lendo/escrevendo na tabela.
- `ProductionCentersTab.tsx`: substituir `readStatus`/`writeStatus` pelo hook. Manter a chamada real ao bridge local; só o resultado vai para o banco.
- Como o `device_id` é obrigatório: se o navegador não estiver "ativado" como device, cair no comportamento atual (estado local apenas) com aviso "Ative este dispositivo para compartilhar status".

## Item 4 — Status das adquirentes (PagSeguro/Stone/Getnet/Rede)

Os 4 cards já foram trocados para "Em breve" sem estado de conexão. Quando uma integração real for implementada no futuro, o status deve ser gravado em uma tabela `tenant_integrations` (provider, status, credenciais cifradas, `connected_at`). Não criar a tabela agora — fica como diretriz para quando alguma adquirente for de fato integrada.

## Resumo do que será alterado

**Migrations (1):**
- Criar `admin_settings` + `pdv_printer_status` com GRANTs, RLS e trigger `updated_at`.

**Arquivos novos:**
- `src/hooks/use-admin-setting.ts`
- `src/hooks/use-printer-status.ts`

**Arquivos editados:**
- `src/components/super-admin/dashboard/AdminMetricsGrid.tsx`
- `src/components/pdv/settings/ProductionCentersTab.tsx`

**Não alterados:**
- `src/lib/active-order-storage.ts` (uso correto para cliente final)
- `IntegrationsHub.tsx` (sem integrações reais ainda)

Confirma este escopo? Em especial: (a) manter `active-order-storage` como está, e (b) status de impressora por dispositivo (não global por tenant).
