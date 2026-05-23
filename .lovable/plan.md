## Problema

Hoje, no caixa, ao clicar em **"Registrar pagamento"** num pedido de delivery, abre o `DeliveryPaymentDialog` (modal próprio, mais simples). Já no salão (mesa/comanda), abre o `PaymentDialog` (modal completo, com desconto guiado, taxa de serviço, várias formas de pagamento, NFC-e etc.). O usuário quer **um único modal de cobrança**, igual ao do salão, também para delivery.

## Mudança

Unificar usando o `PaymentDialog` do salão como modal único, adicionando suporte a "pedido de delivery" via uma nova prop, e aposentando o `DeliveryPaymentDialog`.

### 1) `PaymentDialog` aceita pedido de delivery

Adicionar prop opcional:

```ts
deliveryOrder?: DeliveryOrder | null;
```

Quando `deliveryOrder` está presente (e `comanda`/`table` não):

- **Título**: `Pedido #<order_number> · <customer_name>` (com ícone `Bike`/`Store` para retirada).
- **Itens (Resumo)**: mapear `delivery_order_items` para a mesma estrutura visual usada na lista de itens da comanda (qtd × nome, subtotal). Sem opção de adicionar/remover item.
- **Totais**: subtotal = `order.subtotal`; usar `order.delivery_fee` como linha extra "Taxa de entrega"; `order.discount` como desconto pré-aplicado (linha informativa, separada do desconto manual do operador).
- **Modos desabilitados** (delivery não suporta): "Por produto", "Split por comanda", edição de itens, NF-e (mantém apenas geração de recibo não fiscal, se aplicável), cancelamento de comanda. "Várias formas de pagamento" continua disponível.
- **Forma de pagamento**: mesmas opções do salão (Dinheiro, Cartão crédito/débito, PIX, VR/VA). Pré-seleciona com base em `order.payment_method` (cash→dinheiro, credit/credito→crédito, etc.).
- **Desconto manual e taxa de serviço**: funcionam normalmente (mesmo fluxo guiado do salão).
- **Validação de troco vs gaveta**: mantém comportamento atual.

### 2) Submissão para delivery

Em `handleSubmit`, quando `deliveryOrder` está presente:

- Substituir as chamadas a `registerPayment`/`registerTablePayment`/`registerExtraPaymentLine` por `registerDeliveryPayment` (de `usePDVDeliveryCheckout`).
- Modo simples: 1 chamada com método/valor final.
- Modo "Várias formas" (split-forms): chamar `registerDeliveryPayment` 1ª linha com `source: "delivery"`, demais linhas com `source: "delivery"` também — mas como o hook atual marca `cashier_confirmed_at` na 1ª chamada, precisamos expor uma variação `registerDeliveryExtraPaymentLine` em `use-pdv-delivery-checkout.ts` que **apenas insere o movimento de caixa** (sem reatualizar pedido) para as linhas adicionais. Adicionar essa função no hook.
- Sem modo "Por produto" nem "Split por comanda".

### 3) Tela de sucesso

Reaproveita a mesma tela de sucesso do `PaymentDialog` (mostra troco, etc.). Remove dependências de "imprimir cupom fiscal" quando origem for delivery — mantém apenas botão "Imprimir recibo" (não fiscal) usando os dados do pedido.

### 4) Cabeçalho e contexto

Trocar `isTablePayment` por uma união lógica:

```ts
const context: "table" | "comanda" | "delivery" =
  table ? "table" : deliveryOrder ? "delivery" : "comanda";
```

Usar `context` para gates de UI (esconder add/remove/by-product/NFCe quando `delivery`).

### 5) Integração no caixa

Em `src/components/pdv/cashier/SalonQueuePanel.tsx`:

- Remover `DeliveryPaymentDialog` e o estado `paymentOrder` específico, ou trocá-lo para abrir `PaymentDialog` passando `deliveryOrder={paymentOrder}` e `drawerBalance`.
- `onRegisterPayment` continua chamando `setPaymentOrder(order)`.
- `onSuccess` invalida `pdv-delivery-queue` (já feito pelo hook).

### 6) Limpeza

- Deletar `src/components/pdv/cashier/DeliveryPaymentDialog.tsx`.
- Remover imports órfãos.

## Escopo dos arquivos

- `src/components/pdv/cashier/PaymentDialog.tsx` — adicionar suporte a `deliveryOrder`, gates de UI, branch de submit.
- `src/hooks/use-pdv-delivery-checkout.ts` — adicionar `registerDeliveryExtraPaymentLine` para suportar split-forms.
- `src/components/pdv/cashier/SalonQueuePanel.tsx` — trocar dialog usado para delivery.
- `src/components/pdv/cashier/DeliveryPaymentDialog.tsx` — remover.

## Fora de escopo

- Mudanças no `PaymentDialog` que afetem fluxo do salão.
- Reescrever o `PaymentDialog` (apenas adicionar branches condicionais).
- Suporte a "Por produto" / "Split por comanda" para delivery (não fazem sentido).
