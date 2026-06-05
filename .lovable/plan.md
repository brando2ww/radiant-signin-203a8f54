# Corrigir 3 bugs de cobrança no Caixa

## Decisões confirmadas
- **Delivery**: registrar venda pelo valor cheio recebido do cliente; a operadora lança uma saída manual para pagar o motoboy.
- **Mesa balcão**: as duas águas foram removidas no PaymentDialog antes de cobrar, mas reapareceram no recibo.

## Bug 1 — Total da mesa muda entre tela e impressão (R$ 298 → R$ 313,80)
**Causa:** o `PaymentDialog` permite "remover" itens da tela (estado local `optimisticallyRemoved`) sem chamar `removeItem` no banco. A tela recalcula `liveSubtotal` ignorando essas linhas, mas o `handlePrintNonFiscal` (e/ou o cache reinvalidado após confirmar o pagamento) volta a usar o `comanda.subtotal` persistido ou a lista completa de itens — trazendo as águas de volta no cupom.

**Correção:** quando o operador remove um item no PaymentDialog, executar de fato `removeItem` (com motivo "Removido na cobrança") em vez de só ocultar no estado local. Assim a remoção fica persistida, o trigger `update_comanda_subtotal` recalcula corretamente, e tela + recibo passam a bater. Como fallback de segurança, congelar `subtotal`/`displayItems` num snapshot no clique de "Cobrar" para que o `handlePrintNonFiscal` não use valores re-fetched.

## Bug 2 — Adicionais não somam no delivery (Geléia Pimenta R$ 5)
**Causa:** ao inserir/atualizar `delivery_order_items`, o `unit_price` está fixo no preço base do produto. O `price_adjustment` das `delivery_order_item_options` é gravado mas nunca somado no `unit_price`/`subtotal` do item, então não entra no subtotal do pedido (R$ 284 + R$ 54 = R$ 338, sem os R$ 5).

**Correção:** no checkout do delivery (interno e público), calcular `unit_price = preçoBase + Σ price_adjustment` antes de gravar o item — mesmo padrão já usado em `ComandaAddItemDialog.tsx:104` no PDV. Conferir também a recomposição em `use-delivery-orders.ts` para garantir que `subtotal = unit_price * quantity` inclui os adicionais.

## Bug 3 — Total do delivery muda (R$ 297,44 → R$ 307,44) e baixa sai pelo valor sem a taxa
Diferença = R$ 10,00 = `delivery_fee`. Mesma raiz para os dois sintomas relatados ("dá baixa de R$ 119 em vez de R$ 129"): o `DeliveryPaymentDialog` mostra `total = Number(order.total)`, mas em parte dos caminhos `delivery_orders.total` está sendo gravado como `subtotal − discount` (sem a taxa), enquanto o cupom impresso do pedido soma `subtotal + taxa − desconto`.

**Correção:**
- Padronizar a fórmula em **um lugar só**: `total = subtotal + delivery_fee − discount`. Ajustar onde o `delivery_orders.total` é gravado (inserts/updates no checkout) e, se houver trigger no banco que recalcule total, alinhar a mesma fórmula.
- No `DeliveryPaymentDialog`, calcular o total localmente a partir dos componentes (`subtotal + delivery_fee − discount`) em vez de confiar cegamente em `order.total`, para evitar regressão em pedidos antigos.
- O `registerDeliveryPayment` já lança `amount = total` na movimentação de caixa — uma vez que o `total` esteja correto, a baixa passa a refletir o valor cheio recebido do cliente. A operadora continua usando "Saída" manual para pagar o motoboy.
- Migration para backfill seletivo: corrigir `delivery_orders.total` apenas em pedidos **abertos / não confirmados no caixa** (`cashier_confirmed_at IS NULL`) para não bagunçar o histórico de caixa já fechado.

## Verificação
- Sushi balcão: 2 sequências + taça vinho, remover 2 águas, desconto R$ 40 → tela e recibo dizem R$ 298,00.
- Delivery #019 (Festival em Casa + Geléia Pimenta R$ 5 + Yakisoba): subtotal R$ 343,00; com taxa R$ 10 e desconto 12% → total ~R$ 309,84; baixa no caixa = total exato.
- Delivery R$ 129 cheio: movimento de venda no caixa lançado como R$ 129; operadora consegue lançar saída de R$ 10 para o motoboy normalmente.

## Arquivos prováveis
- `src/components/pdv/cashier/PaymentDialog.tsx` — remoção real + snapshot para impressão
- `src/hooks/use-pdv-comandas.ts` — garantir `removeItem` aceita motivo "Removido na cobrança"
- `src/components/delivery/checkout/*` e `src/hooks/use-delivery-orders.ts` — somar `price_adjustment` em `unit_price`
- `src/components/pdv/cashier/DeliveryPaymentDialog.tsx` — total = subtotal + taxa − desconto
- Migration corrigindo trigger/fórmula de `delivery_orders.total` + backfill de pedidos abertos
