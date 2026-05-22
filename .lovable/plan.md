# Busca de cupom por cliente no PDV

Hoje o `RedeemCouponDialog` só aceita código exato. Vou adicionar busca por nome ou telefone do cliente, escopada ao estabelecimento.

## Mudanças

### 1. `src/hooks/use-coupon-redemption.ts`
Adicionar `useSearchCouponsForPDV(term)`:
- Filtra `campaign_prize_wins` por `customer_name ILIKE` ou `customer_whatsapp ILIKE`
- Restringe às campanhas do `visibleUserId` (mesma lógica de tenant do lookup atual)
- Faz join com `campaign_prizes` (nome + reward_type/value/product) e `evaluation_campaigns` (nome)
- Retorna lista de `CouponLookupResult` com `status` calculado (active/redeemed/expired)
- Limit 20, ordenado por `created_at desc`

### 2. `src/components/pdv/cashier/RedeemCouponDialog.tsx`
- Trocar input único por **dois modos de busca** com tabs simples (ou toggle): "Código" | "Cliente"
  - **Código**: comportamento atual (input + Validar → result único)
  - **Cliente**: input de nome/telefone + Buscar → lista de cards compactos
- Cada card da lista mostra: código, nome, prêmio, status badge, validade. Clicar no card "abre" o card detalhado (mesmo bloco de detalhe atual com botão de ação), substituindo `result`.
- Mantém todo o fluxo de `handleApply` (aplicar na comanda / marcar resgatado) sem mudança.
- Resetar tabs/listas ao abrir o dialog.

## Fora de escopo
- Não muda `PaymentDialog`, `CashierActionsSidebar`, migração, ou `EvalCupons`.
- Sem mudança no fluxo de aplicação de desconto — só adiciona caminho de descoberta do cupom.
