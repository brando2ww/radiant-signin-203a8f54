# Integração FocusNFE — Arquitetura corrigida (multi-empresa via API)

## Conceito central

A Velara tem **uma única conta FocusNFE** com token master (`FOCUSNFE_TOKEN`). Cada tenant é cadastrado como uma **"Empresa"** na FocusNFE via `POST /v2/empresas`, e a API retorna tokens próprios (`token_producao` e `token_homologacao`) específicos daquela empresa. Toda emissão posterior usa **o token da empresa**, não o master.

- Base produção: `https://api.focusnfe.com.br/v2`
- Base homologação: `https://homologacao.focusnfe.com.br/v2`
- Auth: HTTP Basic — user = token, senha vazia → `Authorization: Basic ${btoa(token + ':')}`

## 1. Segredos (Supabase)

- `FOCUSNFE_TOKEN` — token master da conta Velara (cadastra empresas)
- `FOCUSNFE_WEBHOOK_SECRET` — header de autorização dos webhooks
- `FOCUSNFE_ENCRYPTION_KEY` — chave AES-256 para cifrar os tokens por empresa no banco

> Os tokens de homologação/produção por empresa **vêm da API** ao cadastrar — não são variáveis de ambiente.

## 2. Banco de dados

### `tenant_fiscal_config` (uma linha por tenant)
- `user_id` (owner, único)
- Dados cadastrais: `razao_social`, `nome_fantasia`, `cnpj`, `inscricao_estadual`, `inscricao_municipal`, `regime_tributario` (smallint 1-4), `telefone`, `email`
- Endereço: `logradouro`, `numero`, `complemento`, `bairro`, `municipio`, `uf`, `cep`, `codigo_municipio_ibge`
- Certificado: `certificado_pfx_path` (bucket privado `fiscal-certificates/{userId}/cert.pfx`), `certificado_senha_cifrada`, `certificado_valido_ate`
- NFC-e: `csc_nfce_producao_cifrado`, `id_token_nfce_producao`, `csc_nfce_homologacao_cifrado`, `id_token_nfce_homologacao`
- Habilitação: `habilita_nfce`, `habilita_nfe`, `habilita_nfse`
- Séries: `serie_nfce`, `serie_nfe`, `serie_nfse`
- Integração Focus: `focusnfe_empresa_id` (int), `focusnfe_token_producao_cifrado`, `focusnfe_token_homologacao_cifrado`, `focusnfe_ambiente` ('homologacao'|'producao'), `focusnfe_webhook_id` (int)
- `cadastrada_em`, timestamps
- RLS owner-only; service_role para Edge Functions

### `notas_fiscais`
- `user_id`, `tipo` ('nfe'|'nfce'|'nfse'), `ambiente`
- `referencia_focusnfe` (único; formato `{user_short}-{tipo}-{timestamp}`)
- `numero`, `serie`, `chave_acesso`, `protocolo`
- `status` ('processando'|'autorizada'|'rejeitada'|'cancelada'|'denegada'|'erro')
- `valor_total`, `destinatario_nome`, `destinatario_documento`, `destinatario_email`
- `caminho_xml`, `caminho_danfe` (URLs Focus), `xml_cancelamento`, `mensagem_sefaz`
- `payload_enviado` (jsonb), `resposta_api` (jsonb)
- `origem_tipo` ('pdv_order'|'pdv_comanda'|'delivery_order'|'manual'), `origem_id`
- `cancelamento_justificativa`, `cancelada_em`
- `financial_transaction_id` (FK opcional)
- `emitida_em`, timestamps + indexes (`user_id`,`status`,`tipo`,`referencia_focusnfe`)
- RLS owner

### `notas_fiscais_cartas_correcao` (NF-e CC-e)
- `nota_id`, `sequencia`, `correcao` (≥15 chars), `protocolo`, `status`, `xml_url`, timestamps + RLS

### `delivery_settings.nfce_auto_emit` (bool, default false)

### Storage
- Bucket privado `fiscal-certificates`, política `auth.uid()::text = (storage.foldername(name))[1]`

## 3. Edge Functions

Padrão: `getClaims` → `pdv_resolve_owner` → lê `tenant_fiscal_config` → decifra token da empresa → chama Focus → grava resposta. Erros SEFAZ traduzidos via dicionário PT-BR.

| Função | Endpoint Focus | Auth | Descrição |
|---|---|---|---|
| `focusnfe-cadastrar-empresa` | `POST/PUT /v2/empresas` | **master** | Cria/atualiza empresa, guarda tokens retornados cifrados |
| `focusnfe-registrar-webhook` | `POST /v2/webhooks` | empresa | Registra endpoint do receiver com `FOCUSNFE_WEBHOOK_SECRET` |
| `focusnfe-emitir-nfce` | `POST /v2/nfce?ref=` | empresa | Síncrono — grava `autorizada`/`rejeitada` imediatamente |
| `focusnfe-emitir-nfe` | `POST /v2/nfe?ref=` | empresa | Assíncrono — grava `processando` |
| `focusnfe-emitir-nfse` | `POST /v2/nfse?ref=` | empresa | Assíncrono |
| `focusnfe-consultar-nota` | `GET /v2/{tipo}/{ref}` | empresa | Polling de status |
| `focusnfe-cancelar-nota` | `DELETE /v2/{tipo}/{ref}` | empresa | Justificativa ≥15 chars |
| `focusnfe-carta-correcao` | `POST /v2/nfe/{ref}/carta_correcao` | empresa | CC-e |
| `focusnfe-reenviar-email` | `POST /v2/{tipo}/{ref}/email` | empresa | Reenvio |
| `focusnfe-webhook-receiver` | público (JWT off) | secret | Valida header, atualiza nota, dispara Realtime |
| `focusnfe-exportar-xmls` | – | – | ZIP por período |

### Cifra dos tokens
Helper compartilhado em `_shared/crypto.ts` usando WebCrypto AES-GCM com `FOCUSNFE_ENCRYPTION_KEY`. Tokens nunca retornam ao frontend.

### Geração de `ref`
`{user_id_curto}-{tipo}-{epoch_ms}` — garante unicidade na conta compartilhada e permite identificar tenant via prefixo (backup do CNPJ).

## 4. Frontend

### Aba Fiscal em `/pdv/configuracoes` (nova `FiscalTab.tsx`)
Substitui o card atual "NF-e Automática" e absorve a configuração fiscal completa:
- Form com todos os dados cadastrais + endereço (com lookup ViaCEP)
- Upload do certificado A1 → bucket privado
- Campos CSC/ID Token NFC-e
- Toggle ambiente (Homologação/Produção) com aviso visual quando em produção
- Toggles `habilita_nfce`/`nfe`/`nfse`
- Botão **"Salvar e ativar na FocusNFE"** → `focusnfe-cadastrar-empresa` (cria na 1ª vez, atualiza nas seguintes) + registra webhook automaticamente
- Estado pós-ativação: badge "Empresa ativa", data de validade do certificado, botão "Reenviar dados"
- **Nenhum token visível** — texto: "A conexão com a FocusNFE é gerenciada pela Velara"

### Hub de integrações
Card "FocusNFE" em `IntegrationsHub.tsx` (categoria Fiscal) → atalho para `/pdv/configuracoes?tab=fiscal`.

### Notas Fiscais (`/pdv/notas-fiscais` — reaproveita `Invoices.tsx`)
Abas:
- **Emitidas**: lista filtrada por tipo/status/período/ambiente; ações: detalhes, DANFE/XML, reenviar e-mail, cancelar (modal justificativa ≥15), CC-e (apenas NF-e autorizada)
- **Emitir NF-e**: wizard (destinatário, importar itens de venda/pedido, transporte, pagamento, info adicional)
- **Emitir NFS-e**: form (tomador, código serviço municipal, ISS, valor)

### PDV / Caixa
- Reaproveitar `useNFCeEmission` → apontar para `focusnfe-emitir-nfce`
- `PaymentDialog`: botão "Emitir NFC-e" + estado em tempo real (síncrono — já resolve em ~3s); sucesso mostra chave, número e DANFE; erro mostra `mensagem_sefaz` traduzida

### Delivery
- Toggle "Emitir NFC-e automaticamente ao confirmar pagamento" em `delivery/Settings.tsx`
- Ativo: dispara emissão na confirmação do pagamento no caixa
- Inativo: botão manual "Emitir nota" em cada pedido pago

### Financeiro
- Nota autorizada → cria/atualiza `pdv_financial_transactions` via `financial_transaction_id`
- Cancelamento → estorna
- Relatório por período + "Exportar XMLs"

### Realtime
Receiver dispara update em `notas_fiscais`; frontend escuta via canal `notas_fiscais:user_id={uid}` para atualizar listas e diálogos sem reload.

## 5. Coexistência com integração atual

A função existente `emit-nfce` (Nuvem Fiscal) **permanece** para tenants já configurados. Nova flag `tenant_fiscal_config.provedor` ('focusnfe'|'nuvem_fiscal') decide qual Edge Function `useNFCeEmission` chama. Migrar tenants no próprio fluxo de ativação.

## 6. Segurança

- Tokens cifrados AES-GCM no banco; service role apenas
- `FOCUSNFE_TOKEN` master só usado em `focusnfe-cadastrar-empresa`
- Webhook valida header de autorização contra `FOCUSNFE_WEBHOOK_SECRET`
- RLS owner em todas as tabelas + GRANTs corretos
- Bucket `fiscal-certificates` privado, prefixo `{userId}/`
- Validação Zod em todas as Edge Functions
- Ambiente homologação visualmente isolado (badge amarelo nas listas)

## 7. Ordem de entrega

1. Secrets (`FOCUSNFE_TOKEN`, `FOCUSNFE_WEBHOOK_SECRET`, `FOCUSNFE_ENCRYPTION_KEY`) + migrations + bucket + RLS/GRANTs
2. Helper de cifra + `focusnfe-cadastrar-empresa` + `focusnfe-registrar-webhook`
3. `FiscalTab.tsx` (config + upload + ativar)
4. `focusnfe-emitir-nfce` + integração no `PaymentDialog`
5. `focusnfe-webhook-receiver` + Realtime
6. `focusnfe-emitir-nfe` + `consultar-nota` + `cancelar-nota` + `carta-correcao`
7. `focusnfe-emitir-nfse`
8. Automação delivery + financeiro + relatórios + export XML

## Confirmações pendentes

1. **Confirma** os 3 secrets a adicionar: `FOCUSNFE_TOKEN`, `FOCUSNFE_WEBHOOK_SECRET`, `FOCUSNFE_ENCRYPTION_KEY`? (A chave de cifra é gerada uma vez e nunca rotacionada sem migração.)
2. **Coexistência com Nuvem Fiscal**: manter ambos provedores (campo `provedor` por tenant) ou substituir totalmente? Recomendo manter para não quebrar tenants já configurados.
3. **NFS-e**: priorizar alguma prefeitura específica (cobertura Focus é parcial)?
