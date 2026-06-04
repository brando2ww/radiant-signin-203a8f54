## 1. Remover integrações falsas de adquirentes (PagSeguro, Stone, Getnet, Rede)

Os cards em `src/components/pdv/integrations/{PagSeguro,Stone,Getnet,Rede}IntegrationCard.tsx` usam `setTimeout(() => setIsConnected(true), 1500)` e descartam o token digitado — o lojista pensa que conectou um adquirente mas nada é persistido.

Ação:
- Reescrever os 4 cards como estado honesto "Em breve — integração em desenvolvimento":
  - Remover `setTimeout`, `useState` de token/PV/connected e os botões "Conectar / Desconectar".
  - Manter cabeçalho (logo/nome/descrição) e adicionar badge `secondary` "Em breve" + parágrafo curto explicando que ainda não está disponível e que cobranças devem ser registradas manualmente no PDV.
  - Remover todos os inputs de token/credencial (nada para salvar).
- Em `src/pages/pdv/IntegrationsHub.tsx`: manter os cards visíveis (sinaliza roadmap), atualizar qualquer subtítulo/contagem de "integrações ativas" para não contar esses 4.

## 2. Remover completamente Nuvem Fiscal — FocusNFE é o único provedor fiscal

### Edge functions a deletar (`supabase--delete_edge_functions`)
- `emit-nfce`
- `cancel-nfce`
- `check-nfce-status`
- `resend-nfce`
- `fetch-nfe-automatica` (usa `auth.nuvemfiscal.com.br` / `api.nuvemfiscal.com.br`)

Também apagar as pastas correspondentes em `supabase/functions/`.

### Código frontend a remover/migrar
- `src/hooks/use-fiscal-coupon-actions.ts` — substituir as chamadas para `cancel-nfce` / `check-nfce-status` / `resend-nfce` pelas equivalentes FocusNFE (`focusnfe-cancelar-nota`, `focusnfe-consultar-nota`, e — para reenvio — disparar novamente `focusnfe-emitir-nfce` a partir do payload original). Ajustar tipos do payload conforme as functions Focus.
- `src/hooks/use-pdv-invoices.ts` (linha 222) — remover a invocação de `fetch-nfe-automatica` e a feature de importação automática de NF-e via Nuvem Fiscal. UI que dependia disso (botão de "Buscar automaticamente") deve sumir; manter apenas import manual de XML/PDF.
- `src/hooks/use-fiscal-coupons.ts` — remover o campo `nuvem_fiscal_id` do tipo TypeScript local (a coluna no banco fica como legado, só não usamos mais).
- `src/hooks/use-nfce-emission.ts` — já usa `focusnfe-emitir-nfce`, manter sem mudanças.
- Buscar `rg -n "nuvemfiscal|nuvem_fiscal"` e limpar qualquer string/comentário restante em código de aplicação (não tocar em `src/integrations/supabase/types.ts`, que é gerado).

### Configuração fiscal por tenant
Hoje `tenant_fiscal_config` é referenciada por hooks via `as any` mas **não existe** no banco. Vamos criá-la, sem campo de seleção de provedor.

Migração (`supabase--migration`):
- `CREATE TABLE public.tenant_fiscal_config` com os campos hoje usados por `useFiscalConfig` (`razao_social`, `nome_fantasia`, `cnpj`, `inscricao_estadual`, `inscricao_municipal`, `regime_tributario`, `telefone`, `email`, `logradouro`, `numero`, `complemento`, `bairro`, `municipio`, `uf`, `cep`, `codigo_municipio_ibge`, `certificado_pfx_path`, `certificado_valido_ate`, `id_token_nfce_producao`, `id_token_nfce_homologacao`, `habilita_nfce`, `habilita_nfe`, `habilita_nfse`, `serie_nfce`, `serie_nfe`, `serie_nfse`, `focusnfe_empresa_id`, `focusnfe_ambiente`, `cadastrada_em`, `last_test_at`, `last_test_status`, `last_test_message`) + `id`, `user_id unique`, `created_at`, `updated_at`.
- GRANTs para `authenticated`/`service_role` (sem `anon`).
- RLS: leitura para dono + `is_establishment_member(user_id)`; escrita só dono; total `service_role`.
- Trigger `update_updated_at_column`.

UI (`src/components/pdv/settings/FiscalTab.tsx` + `src/pages/pdv/Fiscal.tsx`):
- Não introduzir RadioGroup de provedor; remover qualquer cópia/aviso que mencione "Nuvem Fiscal".
- Cabeçalho mostra apenas badge "Provedor: FocusNFE" como rótulo informativo.
- Manter os campos atuais do FocusNFE (CSC, ambiente, tokens, certificado .pfx).

## 3. iFood — mover Client ID/Secret para a edge function

Hoje `IFoodConnectionDialog.tsx` coleta `clientId` + `clientSecret` no frontend e `use-ifood-integration.ts` envia ambos no body de `ifood-oauth`.

Ação:
- Solicitar via `secrets--add_secret`: `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET`.
- Atualizar `supabase/functions/ifood-oauth/index.ts` para ler `Deno.env.get(...)` e ignorar credenciais do body. Se as envs faltarem → `503 { error: "Integração iFood não configurada pelo administrador" }`.
- `IFoodConnectionDialog.tsx`: remover inputs de Client ID/Secret, manter só "Código de autorização" + instruções. `use-ifood-integration.ts` muda a assinatura para `{ code }`.

## 4. WhatsApp/Evolution — falhar com mensagem clara

Edge functions afetadas: `send-quotation-whatsapp`, `whatsapp-qrcode`, `whatsapp-transactions`, `register-whatsapp-webhook`, `send-whatsapp-code`, `send-2fa-code`, `send-tasks-report`.

Ação (functions):
```ts
const url = Deno.env.get("EVOLUTION_API_URL");
const key = Deno.env.get("EVOLUTION_API_KEY");
if (!url || !key) {
  console.error("Evolution não configurado");
  return json({ error: "WhatsApp não configurado", code: "evolution_not_configured" }, 503);
}
```
Inserir no início de cada handler, antes de qualquer chamada externa.

Ação (UI):
- Nova function leve `whatsapp-check-config` retornando `{ configured: boolean }` a partir da presença das envs.
- Em `src/pages/pdv/IntegrationsHub.tsx`, antes de renderizar o card WhatsApp, consultar esse status. Se `configured === false`, mostrar `<Alert>` "WhatsApp não configurado pelo administrador — solicitar ativação no suporte" e desabilitar botões de conectar/gerar QR.
- Em fluxos que disparam mensagens (cotações, código 2FA, relatório de tarefas) tratar o erro `evolution_not_configured` com `toast.error("WhatsApp não está configurado no servidor")`.

## Detalhes técnicos

- Cards "Em breve" seguem `bg-card`, `text-muted-foreground`, badge `secondary` — sem cores custom (memória de Color Scheme).
- Coluna legada `nuvem_fiscal_id` em `pdv_nfce_emissions` permanece no banco (não-destrutivo); só paramos de ler/gravar.
- Não tocar em fluxos financeiros, comandas ou pagamentos além do necessário para remover dependências.
- Não editar `src/integrations/supabase/types.ts` manualmente — será regenerado após a migração.

## Arquivos afetados

Frontend:
- `src/components/pdv/integrations/{PagSeguro,Stone,Getnet,Rede}IntegrationCard.tsx`
- `src/pages/pdv/IntegrationsHub.tsx`
- `src/components/pdv/settings/FiscalTab.tsx`, `src/pages/pdv/Fiscal.tsx`, `src/hooks/use-fiscal-config.ts`
- `src/hooks/use-fiscal-coupon-actions.ts`, `src/hooks/use-fiscal-coupons.ts`, `src/hooks/use-pdv-invoices.ts`
- `src/components/pdv/settings/IFoodConnectionDialog.tsx`, `src/hooks/use-ifood-integration.ts`

Backend:
- Deletar: `supabase/functions/{emit-nfce,cancel-nfce,check-nfce-status,resend-nfce,fetch-nfe-automatica}/`
- Editar: `supabase/functions/ifood-oauth/index.ts`
- Editar (guard de envs): `send-quotation-whatsapp`, `whatsapp-qrcode`, `whatsapp-transactions`, `register-whatsapp-webhook`, `send-whatsapp-code`, `send-2fa-code`, `send-tasks-report`
- Nova: `supabase/functions/whatsapp-check-config/`
- Migração: criar `tenant_fiscal_config` com GRANTs/RLS/trigger
- Secrets a adicionar: `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET`
