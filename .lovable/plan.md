## Problema

No `PaymentDialog`, ao cobrar um pedido de delivery, o `subtotal` é montado a partir de `deliveryOrder.subtotal` (soma dos itens), mas o **desconto** (`deliveryOrder.discount`) e o **cupom** (`deliveryOrder.coupon_code`) aplicados pelo cliente no checkout do delivery são ignorados. Resultado: o total cobrado no caixa fica maior do que o total real do pedido (ex.: subtotal R$ 59,00 sem refletir o cupom, enquanto o pedido vale R$ 51,92).

## Solução

Pré-aplicar automaticamente o desconto do pedido (incluindo o `coupon_code`, quando houver) como um `appliedDiscount` no `PaymentDialog`, exatamente como se o operador tivesse resgatado o cupom manualmente. Assim o resumo, a barra de desconto, o total e o registro no caixa (`couponCode`, `discountAmount`, `discountReason`) ficam consistentes com o pedido.

### Mudanças (apenas `src/components/pdv/cashier/PaymentDialog.tsx`)

1. **Pré-aplicar desconto do delivery ao abrir**
   - No `useEffect` que reage a `open + isDelivery`, se `deliveryOrder.discount > 0`:
     - Setar `appliedDiscount = { type: "value", amount: deliveryOrder.discount, rawValue: String(deliveryOrder.discount), authorizedBy: "Pedido delivery", reason: deliveryOrder.coupon_code ? "Cupom aplicado no pedido" : "Desconto do pedido", couponCode: deliveryOrder.coupon_code ?? undefined }`.
     - `setDiscountStage("applied")`.
   - Limpar esse estado ao fechar (já existe reset geral; garantir que cobre esse caso).

2. **Bloquear edição do desconto em delivery**
   - Quando `isDelivery && appliedDiscount?.couponCode` (ou `discount > 0` vindo do pedido), esconder os botões "Resgatar cupom", "Desconto em %", "Desconto em R$" e o botão de remover desconto — o desconto do pedido é imutável no caixa. Mostrar apenas a linha "Desconto aplicado: -R$ X,XX (cupom XYZ)".

3. **Garantir taxa de serviço desligada por padrão**
   - Já está coberto via `serviceFeeAllowed`; manter como está (delivery não cobra 10%).

4. **Telemetria/registro**
   - O `handleSubmit` já envia `discountAmount`, `discountReason`, `couponCode` quando `appliedDiscount` existe — nenhuma mudança extra necessária.

### Fora do escopo

- Não mexer em `delivery_fee` (já está embutido no `deliveryOrder.total` exibido em outras telas; aqui o caixa cobra subtotal − desconto e a taxa de entrega é tratada à parte no fluxo do entregador). Se você quiser também incluir `delivery_fee` no total cobrado, me avise que ajusto o plano.
- Sem mudanças no hook `use-pdv-delivery-checkout` nem no `SalonQueuePanel`.

### Arquivos afetados

- `src/components/pdv/cashier/PaymentDialog.tsx`
