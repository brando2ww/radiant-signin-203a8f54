# Incluir delivery nos totais do caixa

## Diagnóstico

Hoje, `usePDVDeliveryCheckout.buildSessionDeltas` já incrementa `total_cash`, `total_credit`, `total_debit`, `total_pix`, `total_voucher` e `total_sales` da sessão, **independentemente** se o pagamento foi `source='delivery'` (na entrega) ou `source='delivery_online'` (já pago online).

Problemas reais a corrigir:

1. Pagamentos **online** (PIX/cartão pago no app) estão sendo somados em `total_pix` / `total_credit` / `total_debit`, inflando a conferência das máquinas e do PIX no caixa, e (se um dia houver um online em "dinheiro") afetariam a gaveta.
2. Não existe a linha **"Online (Delivery)"** no rodapé/fechamento.
3. Movimentações de delivery aparecem como uma "Venda" comum, sem distinção visual.
4. O usuário também relata percepção de que delivery na entrega não está somando — vamos garantir invalidação correta dos totais para refletir em tempo real.

---

## Mudanças

### 1. `src/hooks/use-pdv-delivery-checkout.ts`
- Em `buildSessionDeltas`, receber a `source` e, quando `source === 'delivery_online'`, **NÃO** atualizar `total_cash/credit/debit/pix/voucher/card`. Apenas atualizar `total_sales` e um novo agregado `total_online_delivery` (somatório informativo).
- Pagamentos `source='delivery'` (na entrega) seguem somando normalmente em `total_cash/credit/debit/pix/voucher` — isso já alimenta a gaveta e a conferência.

### 2. Migration: adicionar coluna `total_online_delivery numeric default 0` em `pdv_cashier_sessions`.

### 3. `src/components/pdv/cashier/CashierSummaryFooter.tsx`
- Nova prop `totalOnlineDelivery: number`.
- No bloco "Vendas por forma de pagamento", adicionar linha **"Online (Delivery)"** (ícone `Globe` ou `Bike`) com tag "informativo — não entra na gaveta".
- `Total Vendas` continua usando `totalSales` da sessão (já inclui tudo).
- Sem alteração em `netCash`/`drawerBalance` — eles já refletem corretamente porque `total_cash` agora não receberá online.

### 4. `src/pages/pdv/Cashier.tsx`
- Ler `total_online_delivery` da sessão e passar para o footer.

### 5. `src/components/pdv/CashMovementsList.tsx`
- Aceitar `source` no tipo `Movement`.
- Quando `source` for `delivery` ou `delivery_online`, exibir **Badge "Delivery"** ao lado do badge de tipo, com cores neutras (system tokens). Para `delivery_online`, sufixo "(online)" no badge.
- Descrição já vem montada do hook ("Delivery #N — Cliente"); não alterar.

### 6. `src/hooks/use-pdv-cashier.ts`
- Tipo `CashMovement` ganha `source?: 'salon' | 'delivery' | 'delivery_online' | null` (apenas tipagem; a coluna já existe).
- Sem mudança de query (já seleciona `*`).

### 7. `src/components/pdv/CloseCashierDialog.tsx`
- No resumo de fechamento e no recibo impresso (`printCashierReport`), adicionar linha "Online (Delivery): R$ X (informativo)" abaixo da conferência de máquinas.
- `expectedCash` continua igual — não inclui online.
- Conferência de Crédito/Débito/PIX usa os totais da sessão (que após a mudança refletem só "na entrega" + salão), portanto a conferência das maquininhas fica correta.

### 8. Atualização em tempo real
- `usePDVDeliveryCheckout.invalidate()` já invalida `pdv-cashier-active` e `pdv-cashier-movements`. Adicionar invalidação após o registro continua suficiente — verificar e manter. Sem mudanças necessárias além das já existentes.

---

## Resumo do comportamento final

| Cenário | total_cash | total_credit/debit/pix | total_online_delivery | drawerBalance | Total Vendas |
|---|---|---|---|---|---|
| Venda salão dinheiro R$ 50 | +50 | — | — | +50 | +50 |
| Delivery na entrega dinheiro R$ 30 | +30 | — | — | +30 | +30 |
| Delivery na entrega cartão R$ 40 | — | +40 (crédito) | — | — | +40 |
| Delivery pago online PIX R$ 25 | — | — | +25 | — | +25 |

Movimentações: cada registro de delivery aparece com badge "Delivery" e descrição `Delivery #N — Cliente`.
