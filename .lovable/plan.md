## Problema

No card "Taxas por forma de pagamento" as formas aparecem em inglês (`pix`, `cash`, `credit`, `debit`, `voucher`) porque o `labelByKey` só conhece o que está cadastrado em `pdv_payment_method_fees`. Quando não há cadastro, cai no slug cru.

## Solução

Adicionar um dicionário fallback pt-BR em `PaymentFeesReport.tsx`. Em `label: labelByKey.get(key) ?? key` trocar para `?? PT_LABELS[key] ?? key`.

Mapeamento:
- `cash` → `Dinheiro`
- `pix` → `PIX`
- `credit` → `Crédito`
- `debit` → `Débito`
- `voucher` → `Vale-refeição`
- `ifood` → `iFood`
- `rappi` → `Rappi`
- `uber_eats` → `Uber Eats`

Para padronizar em outros pontos, exportar `PT_PAYMENT_METHOD_LABELS` em `src/lib/financial/payment-method-keys.ts` com função utilitária `paymentMethodLabel(key)` e usar em `PaymentFeesReport.tsx`.

## Arquivos

- `src/lib/financial/payment-method-keys.ts` — adicionar `PT_PAYMENT_METHOD_LABELS` + `paymentMethodLabel()`.
- `src/components/pdv/financial/PaymentFeesReport.tsx` — usar `paymentMethodLabel(key)` como fallback do `labelByKey`.

Sem mudanças de schema.
