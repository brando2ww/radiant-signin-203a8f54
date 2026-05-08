## Bug

Ao cobrar com **Várias formas** (split-forms) sem usar split-por-comanda (ex.: mesa única com Cartão Débito + Pix), o `handleSubmit` do `PaymentDialog` cai no `else` final e chama `registerTablePayment` (ou `registerPayment`) **uma única vez** com `paymentData.paymentMethod` — que vem do `selectedMethod` da aba "Tudo" (default `dinheiro`). As linhas de `splitPayments` (com `method` e `cardType` próprios) são ignoradas, então tudo é contabilizado como dinheiro no caixa.

Hoje só o caminho `isSplitByComanda` (`splitPayments[*].comandaId` definido) itera as linhas — mas no split-forms normal nenhuma linha tem `comandaId`.

## Correção (mínima, só no front)

Arquivo: `src/components/pdv/cashier/PaymentDialog.tsx`, no `handleSubmit` (≈ linhas 608-642).

Adicionar um novo ramo **antes** do fallback `registerTablePayment/registerPayment`, ativado quando `splitEnabled && splitPayments.length > 0 && !isSplitByComanda`:

1. Resolver método de cada linha igual ao caminho já existente:
   ```ts
   const lineMethod = line.method === "cartao"
     ? (line.cardType === "debito" ? "debito" : "credito")
     : line.method;
   const lineAmount = parseFloat(line.amount) || 0;
   ```
2. **Mesa** (`isTablePayment && table`):
   - Primeira linha: `registerTablePayment({ tableId, comandaIds, amount: lineAmount, paymentMethod: lineMethod, cashReceived/changeAmount/installments por linha })` — fecha comandas/mesa e registra a 1ª movimentação.
   - Linhas seguintes: `registerPayment({ comandaId: tableComandas[0].id, orderId: tableComandas[0].order_id, amount: lineAmount, paymentMethod: lineMethod, ... })`. Como as comandas já estão `fechada`, o filtro `.in("status", ["aberta","aguardando_pagamento","em_cobranca"])` no `registerPayment` lançará "Comanda já finalizada" e bloqueia o registro do caixa.

   Para resolver isso de forma limpa, **adicionar uma nova mutation** em `src/hooks/use-pdv-payments.ts`: `registerExtraPaymentLine({ orderId, comandaId, amount, paymentMethod, cashReceived?, changeAmount?, installments? })` que apenas:
   - Insere um `pdv_payments` (com `buildPaymentSnapshot` para taxas) quando houver `orderId`.
   - Insere um `pdv_cashier_movements` do tipo `venda` com o `payment_method` e `amount` corretos, e aplica os `buildSessionDeltas` na sessão ativa.
   - **Não** mexe em comandas / mesa / order (já fechados).

3. **Comanda única** (`!isTablePayment && comanda`):
   - Primeira linha: `registerPayment({ comandaId, orderId, amount: lineAmount, paymentMethod: lineMethod, ... })`.
   - Linhas seguintes: `registerExtraPaymentLine({ orderId: comanda.order_id, comandaId: comanda.id, ... })`.

4. Validar `cashReceived/changeAmount` apenas em linhas `dinheiro`; `installments` só em `credito`.

5. Manter `paymentDoneRef.current = true; setSuccessData; setShowSuccess` após processar todas as linhas.

## Arquivos

- `src/hooks/use-pdv-payments.ts` — adicionar mutation `registerExtraPaymentLine` + expor no retorno.
- `src/components/pdv/cashier/PaymentDialog.tsx` — novo ramo no `handleSubmit` para `splitEnabled && !isSplitByComanda` (mesa e comanda única) usando a nova mutation para as linhas extras.

## Resultado esperado

Ao cobrar uma mesa/comanda em "Várias formas" com Cartão Débito + Pix, o fechamento de caixa mostrará exatamente os valores em "Débito" e "Pix" (e nada em "Dinheiro").
