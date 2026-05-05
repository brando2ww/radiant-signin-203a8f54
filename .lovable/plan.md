## Integrar Delivery na Frente de Caixa via abas no painel lateral

Em vez de criar um bloco paralelo, o painel `SalonQueuePanel` ganha um seletor "Salão / Delivery" no topo, mantendo todo o comportamento atual da aba Salão.

### Arquivos a criar

**1. `src/hooks/use-pdv-delivery-queue.ts`** — fonte de dados do caixa para delivery
- Reusa `delivery_orders` filtrado por `visibleUserId` (via `use-establishment-id`) para staff enxergar dados do dono.
- Retorna pedidos `status NOT IN ('cancelled')` com:
  - `needsActionAtCounter`: status `delivering`/`completed` + `payment_status != 'paid'` → pagar na entrega
  - `needsOnlineConfirmation`: `payment_status = 'paid'` e ainda não baixado no caixa
  - `inProgress`: `pending`/`confirmed`/`preparing`/`ready` (informativo)
- Exposição: `pendingPayment`, `awaitingOnlineConfirmation`, `inProgress`, `totalCount`, contagem para badge.
- Realtime via canal `delivery_orders` (já existe padrão no `use-delivery-orders`).
- Ordenação: pagar na entrega entregues primeiro, depois online aguardando, depois em preparo.

**2. `src/components/pdv/cashier/DeliveryQueueCard.tsx`** — card por pedido
- Header: `#order_number` · nome do cliente · tempo desde criação (date-fns ptBR).
- Itens resumidos: primeiros 3 + "e mais X".
- Total em destaque via `formatBRL`.
- Linha forma de pagamento: derivada de `payment_method` + `payment_status`:
  - `paid` → "Pago online — PIX/Cartão"
  - else → "Pagar na entrega — Dinheiro/Cartão/PIX"
- Badge de status atual (Aguardando preparo / Em preparo / Saiu para entrega / Entregue).
- Botão de ação principal:
  - Pagar na entrega + status entregue/saiu → "Registrar pagamento"
  - Pago online + entregue → "Confirmar recebimento"
  - Em preparo: sem botão (apenas informativo)

**3. `src/components/pdv/cashier/DeliveryPaymentDialog.tsx`** — drawer de pagamento na entrega
- Sheet lateral com resumo do pedido.
- Select de forma recebida: Dinheiro / Crédito / Débito / PIX (operador pode mudar do combinado).
- Se Dinheiro: `CurrencyInput` "valor entregue", troco automático, validação `changeAmount > drawerBalance` (mesma regra do `PaymentDialog`, consumindo `usePDVCashier().drawerBalance`).
- Confirmar: chama hook novo `useDeliveryCheckout.registerDeliveryPayment()` (ver abaixo).

**4. `src/hooks/use-pdv-delivery-checkout.ts`** — registra delivery no caixa
- `registerDeliveryPayment({ orderId, paymentMethod, cashReceived, changeAmount })`:
  1. UPDATE `delivery_orders` → `payment_status = 'paid'`, `status = 'completed'`, `delivered_at = now()` se ainda não.
  2. INSERT em `pdv_cashier_movements` com `type = 'venda'`, `payment_method`, `description = 'Delivery #XXXX — nome'`, e novo flag `source = 'delivery'`.
  3. Atualiza totais da sessão via `applyDeltas` reusando `buildSessionDeltas` (extraído ou duplicado de `use-pdv-payments`).
  4. Bloqueia se `payment_status` já era `paid` (evita dupla baixa).
- `confirmOnlinePayment({ orderId })`:
  1. INSERT movimento informativo (`type = 'venda'`, `payment_method` = pix/credito/debito, `source = 'delivery_online'`, `description = 'Delivery #XXXX online — nome'`).
  2. Aplica deltas correspondentes (afeta `total_pix`/`total_credit`/`total_debit` e `total_sales`, NUNCA `total_cash`).
  3. UPDATE delivery_orders marcando `status = 'completed'` e novo campo `cashier_confirmed_at` (ver migração).

### Alterações em arquivos existentes

**5. `src/components/pdv/cashier/SalonQueuePanel.tsx`** — adicionar abas
- Topo do painel: `Tabs` (shadcn) com triggers "Salão (N)" e "Delivery (N)" — contadores sempre visíveis.
- Padrão: aba `salon`.
- Conteúdo Salão: o JSX atual movido para `<TabsContent value="salon">`.
- Conteúdo Delivery: novo `<TabsContent value="delivery">` listando `DeliveryQueueCard` ordenados.
- Dispara `setTab('delivery')` automaticamente apenas no badge piscando — não troca aba sozinho.
- Pisca novo pedido: `useEffect` comparando id do primeiro pedido vs ref anterior; aplica `animate-pulse` ao trigger Delivery por 3s.

**6. `src/pages/pdv/Cashier.tsx`** — passar handlers para o painel
- Novo state `deliveryPaymentOrder` controlando o drawer.
- Passa `onSelectDeliveryOrder(order)` ao painel; o painel decide se abre `DeliveryPaymentDialog` ou chama `confirmOnlinePayment` direto.
- Render do `<DeliveryPaymentDialog>` próximo dos outros dialogs.

**7. `src/components/pdv/cashier/CashierSummaryFooter.tsx`** — separar delivery
- Adicionar nova prop `deliveryBreakdown: { onCounterCash, onCounterCard, onCounterPix, online }`.
- Renderiza subseção "Delivery" no bloco "Vendas por forma de pagamento" abaixo do salão, com:
  - Salão / Balcão (computado)
  - Delivery (entrega)
  - Delivery (online)
  - Total geral

**8. `src/hooks/use-pdv-cashier.ts`** — agregação por origem
- Computa `salesBySource` lendo `pdv_cashier_movements` filtrando por `source` para o sumário do rodapé.

### Migração de banco (necessária)

```sql
ALTER TABLE pdv_cashier_movements
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'salon' CHECK (source IN ('salon','counter','delivery','delivery_online')),
  ADD COLUMN IF NOT EXISTS delivery_order_id uuid REFERENCES delivery_orders(id);

CREATE INDEX IF NOT EXISTS idx_pdv_cashier_movements_source
  ON pdv_cashier_movements(cashier_session_id, source);

ALTER TABLE delivery_orders
  ADD COLUMN IF NOT EXISTS cashier_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cashier_session_id uuid REFERENCES pdv_cashier_sessions(id);
```

RLS de `pdv_cashier_movements` já cobre via `cashier_session_id` — sem mudanças.

### Regras aplicadas

- Bloqueio de dupla baixa: query checa `delivery_orders.payment_status = 'paid'` antes de inserir.
- Caixa fechado: pedidos seguem aparecendo quando o caixa abrir; sem ação até `activeSession` existir (mesma diretriz do salão).
- Cancelamento posterior: fora do escopo desta etapa (estorno automático fica para iteração seguinte — registrar como TODO).

### O que NÃO muda

- Telas atuais do módulo `/delivery/*`.
- Fluxo de venda/pagamento do salão.
- Cálculo do `drawerBalance` (continua usando `total_cash` líquido).