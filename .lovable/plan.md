## Plano: Finalizar integração FocusNFE (Fases 5–8)

As fases 1–4 já foram entregues (infra de banco, criptografia, cadastro de empresa, emissão NFC-e síncrona, consulta, cancelamento básico, webhook, `FiscalTab` e upload de certificado A1). Este plano cobre o que falta para a integração ficar completa.

### Fase 5 — NF-e assíncrona (modelo 55)

- Edge function `focusnfe-emitir-nfe`: monta payload NF-e (destinatário com CNPJ/CPF, endereço, itens com NCM/CFOP/CEST/origem vindos de `pdv_products`), envia `POST /v2/nfe?ref=...` com token da empresa, grava `notas_fiscais` com `status='processando'`.
- `focusnfe-consultar-nota`: já existe, vai cobrir polling de NF-e (mesmo endpoint `/v2/nfe/{ref}`).
- Hook `useNFeEmission` no frontend + botão "Emitir NF-e" nos detalhes de pedido/venda quando o cliente tem CNPJ.
- Dialog para preencher dados do destinatário quando faltarem (CNPJ, IE, endereço).

### Fase 6 — Cartas de correção (CC-e)

- Edge function `focusnfe-carta-correcao`: `POST /v2/nfe/{ref}/carta_correcao` com `correcao` ≥15 chars; persiste em `notas_fiscais_cartas_correcao` e atualiza `sequencia`.
- UI em `FiscalNotaDetailDialog`: lista CC-e existentes + formulário para nova carta (só para NF-e autorizadas).

### Fase 7 — Hub fiscal e listagem de notas

- Página `/pdv/fiscal` com:
  - Card de status (empresa cadastrada na FocusNFE, certificado válido até, ambiente atual)
  - Tabs: **NFC-e**, **NF-e**, **Eventos** (cancelamentos + CC-e)
  - Filtros por período/status, busca por chave/numero
  - Ações por nota: Ver XML, Ver DANFE, Cancelar, Emitir CC-e (NF-e), Reenviar e-mail
- Card no `/pdv/integracoes` apontando para o hub e para `FiscalTab`.

### Fase 8 — Auto-emissão NFC-e no delivery

- Já temos `delivery_settings.nfce_auto_emit`. Adicionar:
  - Trigger no fechamento de pedido delivery (`delivery_orders` → `completed` + `payment_status='paid'`) que chama `focusnfe-emitir-nfce` via edge function disparada por hook frontend (`useDeliveryOrderActions`).
  - Toggle visível em `delivery/Settings` apontando dependência: precisa de `FiscalTab` ativo.
  - Tratamento de falha: nota fica em `status='erro'` com `resposta_api` preenchida, banner no hub fiscal listando pendências.

### Detalhes técnicos

- Todas as funções continuam usando `_shared/focusnfe-utils.ts` para resolver token de empresa via `pdv_resolve_owner` + `tenant_fiscal_config.focusnfe_tokens` (decifrado com `FOCUSNFE_ENCRYPTION_KEY`).
- Webhook receiver (já criado) atualiza `notas_fiscais.status` para NF-e quando SEFAZ responde — sem mudanças.
- Sem novas migrations: schema da Fase 1 já contempla tudo (`notas_fiscais.tipo='nfe'`, `notas_fiscais_cartas_correcao`, `delivery_settings.nfce_auto_emit`).
- Sem novos secrets além dos 3 já existentes.

### Entregáveis

```text
supabase/functions/
  focusnfe-emitir-nfe/index.ts        (novo)
  focusnfe-carta-correcao/index.ts    (novo)

src/
  hooks/use-nfe-emission.ts           (novo)
  hooks/use-fiscal-notas.ts           (novo — lista + filtros)
  components/pdv/fiscal/
    FiscalNotaDetailDialog.tsx        (novo)
    EmitirNFeDialog.tsx               (novo)
    CartaCorrecaoDialog.tsx           (novo)
  pages/pdv/Fiscal.tsx                (novo — hub)
  pages/delivery/Settings.tsx         (editar — toggle auto-emit)
  hooks/use-delivery-order-actions.ts (editar — disparar auto NFC-e)
  pages/pdv/Integracoes.tsx           (editar — card fiscal)
  App.tsx                             (editar — rota /pdv/fiscal)
```

Confirma para eu seguir com a implementação completa?