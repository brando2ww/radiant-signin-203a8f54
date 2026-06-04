# Integração FocusNFE — NF-e, NFC-e e NFS-e (token único Velara)

Integração multi-tenant com uma **única assinatura da Velara** na FocusNFE. O `FOCUSNFE_TOKEN` é segredo do Supabase, jamais exposto. Cada tenant cadastra apenas seus dados fiscais; o isolamento entre estabelecimentos é feito pelo **CNPJ do emitente** enviado em cada requisição.

## 1. Segredos (Supabase)

- `FOCUSNFE_TOKEN` — token de produção da conta Velara na FocusNFE
- `FOCUSNFE_TOKEN_HOMOLOGACAO` — token do ambiente de testes
- `FOCUSNFE_WEBHOOK_SECRET` — para validar callbacks
- Edge Functions escolhem o token conforme `ambiente` configurado pelo tenant

## 2. Banco de dados (migrations)

### `tenant_fiscal_settings` (dados fiscais por tenant — sem tokens)
- `user_id` (owner, único)
- `cnpj_emitente`, `razao_social`, `nome_fantasia`
- `inscricao_estadual`, `inscricao_municipal`
- `endereco_logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `cep`, `codigo_municipio`
- `regime_tributario` ('simples_nacional' | 'lucro_presumido' | 'lucro_real')
- `serie_nfce`, `serie_nfe`, `serie_nfse`
- `natureza_operacao_padrao`
- `ambiente` ('homologacao' | 'producao')
- `certificado_pfx_path` (storage privado `{userId}/cert.pfx`), `certificado_senha`, `certificado_validade`
- `focusnfe_empresa_registrada` (bool) — flag de cadastro inicial na Focus
- `auto_emit_delivery` (bool)
- timestamps + RLS owner-only + GRANTs

> Reaproveitar campos já existentes em `pdv_settings` quando possível (cert, IM etc.) e migrar para essa tabela dedicada.

### `focusnfe_invoices`
- `user_id`, `tipo` ('nfe' | 'nfce' | 'nfse'), `ambiente`
- `ref` (único por ambiente — formato `{user_id_short}-{tipo}-{timestamp}` para garantir unicidade na conta compartilhada)
- `cnpj_emitente` (denormalizado para auditoria/isolamento)
- `status` ('processando' | 'autorizada' | 'rejeitada' | 'cancelada' | 'denegada' | 'erro')
- `chave_acesso`, `numero`, `serie`, `protocolo`
- `valor_total`, `cnpj_cpf_destinatario`, `nome_destinatario`
- `xml_url`, `danfe_url`, `caminho_xml_nota_fiscal`
- `payload_enviado` (jsonb), `resposta_api` (jsonb), `motivo_erro`
- `origem_tipo` ('pdv_order' | 'pdv_comanda' | 'delivery_order' | 'manual'), `origem_id`
- `cancelamento_justificativa`, `cancelado_em`
- `financial_transaction_id` (FK opcional)
- timestamps, índices (`user_id`,`tipo`,`status`,`ref`,`cnpj_emitente`), RLS owner

### `focusnfe_correction_letters`
- `invoice_id`, `sequencia`, `correcao`, `status`, `protocolo`, `xml_url`, timestamps + RLS

### `delivery_settings.nfce_auto_emit` (bool, default false)

## 3. Edge Functions

Padrão:
1. Auth via `getClaims` → resolve owner via `pdv_resolve_owner`
2. Lê `tenant_fiscal_settings` e valida dados obrigatórios (CNPJ, IE, endereço, certificado)
3. Seleciona `FOCUSNFE_TOKEN` ou `_HOMOLOGACAO` conforme `ambiente`
4. Base URL: `https://homologacao.focusnfe.com.br` ou `https://api.focusnfe.com.br`
5. Auth Basic: `Authorization: Basic ${btoa(token + ':')}`
6. Gera `ref` único por tenant; persiste `cnpj_emitente` em todas as linhas
7. Mensagens de erro traduzidas (dicionário SEFAZ → PT-BR)

Funções:
- `focusnfe-register-company` — cadastra/atualiza empresa do tenant na FocusNFE (PUT `/v2/empresas/{cnpj}`) + upload do certificado A1; chamado ao salvar credenciais
- `focusnfe-test-connection` — GET `/v2/empresas/{cnpj}` para validar registro
- `focusnfe-emit-nfce` — POST `/v2/nfce?ref=...`
- `focusnfe-emit-nfe`   — POST `/v2/nfe?ref=...`
- `focusnfe-emit-nfse`  — POST `/v2/nfse?ref=...`
- `focusnfe-check-status` — GET `/v2/{tipo}/{ref}` (polling até estado terminal)
- `focusnfe-cancel` — DELETE `/v2/{tipo}/{ref}` com `justificativa` (≥15 chars)
- `focusnfe-correction-letter` — POST `/v2/nfe/{ref}/carta_correcao`
- `focusnfe-resend-email` — POST `/v2/{tipo}/{ref}/email`
- `focusnfe-webhook` (público, JWT off) — valida assinatura, identifica tenant via `cnpj_emitente` do payload e atualiza `focusnfe_invoices`
- `focusnfe-export-xmls` — gera ZIP dos XMLs do tenant por período

### Isolamento entre tenants
- Toda requisição inclui o CNPJ do tenant; FocusNFE roteia para o certificado da empresa cadastrada
- `ref` prefixado com hash do `user_id` evita colisão na conta compartilhada
- Edge Function valida que o `cnpj_emitente` retornado pelo webhook bate com algum tenant antes de atualizar

## 4. Frontend

### Hub de Integrações
- Card "FocusNFE" em `IntegrationsHub.tsx` (categoria Fiscal)
- Rota `/pdv/integracoes/focusnfe`:
  - Form com dados fiscais do tenant (CNPJ, IE/IM, endereço, regime, séries, natureza)
  - Toggle de ambiente (Homologação/Produção)
  - Upload do certificado A1 (.pfx) + senha → storage privado `fiscal-certificates/{userId}/cert.pfx`
  - Botão "Registrar empresa na FocusNFE" (chama `focusnfe-register-company`)
  - Botão "Testar conexão" + status da última validação
  - **Nenhum campo de token** — texto explicativo: "A conexão com a FocusNFE é gerenciada pela Velara"
  - Toggle emissão automática no delivery

### Notas Fiscais (`/pdv/notas-fiscais`)
Reaproveitar `Invoices.tsx` com abas:
- **Emitidas** — lista de `focusnfe_invoices` (filtros: tipo, status, período, ambiente)
- **Emitir NF-e** — wizard (destinatário, itens importáveis de vendas/pedidos, transporte, pagamento, info adicional)
- **Emitir NFS-e** — form (tomador, código serviço municipal, ISS, valor)
- Ações: detalhes, DANFE/XML, reenviar e-mail, cancelar (modal justificativa ≥15), CC-e (apenas NF-e)

### PDV / Caixa
- `PaymentDialog`: botão "Emitir NFC-e" + status em tempo real (Processando → Autorizada/Erro)
- Sucesso: chave, número, link DANFE, botões "Imprimir" e "Enviar e-mail"
- Hook `use-focusnfe-emission` (mutation + polling até estado terminal)

### Delivery
- Toggle "Emitir NFC-e automaticamente ao confirmar pagamento" em Settings
- Se ativo: dispara emissão na confirmação do pagamento no caixa
- Se inativo: botão manual "Emitir nota" em cada pedido pago

### Financeiro
- Nota autorizada → cria/atualiza `pdv_financial_transactions` (receita) com `financial_transaction_id`
- Cancelamento estorna a transação
- Relatório de notas fiscais por período + "Exportar XMLs"

## 5. Segurança

- `FOCUSNFE_TOKEN` apenas em Edge Functions (`Deno.env.get`)
- Bucket privado `fiscal-certificates`, política `{userId}/`
- RLS owner em todas as tabelas + GRANTs corretos
- Ambiente homologação isolado visualmente nas listas
- Validação Zod em todas as Edge Functions
- Webhook valida `FOCUSNFE_WEBHOOK_SECRET`

## 6. Ordem de entrega
1. Migrations + bucket + GRANTs/RLS
2. Tela de configuração fiscal + upload certificado + `register-company` + `test-connection`
3. Edge `emit-nfce` + `check-status` + integração no PaymentDialog
4. Webhook
5. NF-e (form completo + cancel + CC-e)
6. NFS-e
7. Automação delivery + integração financeira + relatórios + export XML

## Pontos a confirmar
1. **Coexistência com Nuvem Fiscal**: manter ambos provedores (tenant escolhe) ou substituir Nuvem Fiscal pela FocusNFE?
2. **NFS-e**: priorizar alguma prefeitura específica (cobertura da Focus é parcial)?
3. **Certificado A1**: a FocusNFE no modelo multi-CNPJ exige upload por empresa via API — confirmo pela doc no início da implementação, mas o plano já prevê esse fluxo.
4. Adicionar agora `FOCUSNFE_TOKEN` e `FOCUSNFE_TOKEN_HOMOLOGACAO` aos secrets?
