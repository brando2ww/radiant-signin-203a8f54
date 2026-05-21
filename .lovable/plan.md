## Cancelamento de pedidos no Delivery (paridade com Salão)

Hoje o cancelamento de delivery (no `OrderDetailDialog`) pede só um motivo livre em texto, sem categoria, sem confirmar que o cliente foi avisado, e o cancelamento não aparece no relatório operacional. Além disso, abrir o diálogo de cancelar / mudar status enquanto o `OrderDetailDialog` está aberto está travando a tela (efeito de "freeze" do overlay/pointer-events).

Vamos alinhar o fluxo do delivery ao que já foi feito no salão, sem freeze.

### 1. Reaproveitar o componente de cancelamento

Generalizar o `CancelComandaDialog` (que hoje é específico de comanda) em `src/components/pdv/cashier/CancelOrderDialog.tsx` recebendo um `resourceLabel` ("Comanda" | "Pedido") + summary livre (mesa/nº ou nº do pedido + cliente + valor). Mesmas regras já decididas:

- `Select` de categoria (mesmas chaves: `cliente_desistiu`, `pedido_errado`, `problema_cozinha`, `demora_excessiva`, `item_indisponivel`, `outro`).
- `Textarea` obrigatória, mínimo 20 caracteres, com contador.
- `Checkbox` "Cliente foi informado" obrigatório para liberar o confirmar.
- Loading apenas nos botões (`Confirmar cancelamento` mostra spinner + "Cancelando…", `Voltar` desabilita). Nada de overlay/freeze de tela.
- `onEscapeKeyDown`/`onPointerDownOutside`/`onInteractOutside` bloqueados durante loading.

O `CancelComandaDialog` atual passa a ser apenas um wrapper que chama o componente genérico com `resourceLabel="Comanda"`.

### 2. Diálogo de detalhe do pedido (`OrderDetailDialog.tsx`)

- Substituir o `AlertDialog` interno (motivo livre) pelo novo `CancelOrderDialog`.
- `handleCancel` passa a receber `{ reason, category, customerNotified }` e chamar a mutation atualizada `useCancelOrder`.
- Em sucesso: fechar o diálogo de cancelamento e o `OrderDetailDialog` (já feito via `setTimeout(0)` — mantém).
- Em erro: mantém ambos abertos, libera botões.

### 3. Cancelar/Modificar sem congelar a tela

Aplicar no `OrderDetailDialog` o mesmo padrão que já adotamos no salão para impedir o "freeze":
- `Dialog` principal continua modal, mas o `CancelOrderDialog` é aberto como filho usando `setTimeout(0)` antes do `setOpen(true)` para evitar empilhar overlays do Radix.
- O cancelamento NÃO bloqueia toda a tela: apenas o botão "Confirmar cancelamento" e "Voltar" mostram estado de loading; o restante do `OrderDetailDialog` permanece responsivo (sem `pointer-events-none` ou backdrop extra).
- Para a ação "Avançar status" (`updateStatus`), reaproveitar `useUpdateOrderStatus.isPending` SOMENTE no próprio botão de avanço (já é assim, mas conferir que nada usa o pending para desabilitar o dialog inteiro).
- Já existe o `RadixBodyUnlock` global que limpa `pointer-events`/`overflow` presos; garantir que o fluxo novo dispare o unlock após qualquer fechamento (não precisa de código extra — o guard global cuida disso quando nenhum overlay Radix está mais aberto).

Resultado: usuário pode cancelar/avançar status sem a tela travar; só o botão clicado mostra spinner.

### 4. Persistir categoria e flag de cliente informado

A coluna `cancellation_reason` (texto) já existe em `delivery_orders`. Adicionar duas colunas opcionais:
- `cancellation_category text NULL`
- `customer_notified boolean NOT NULL DEFAULT false`

Atualizar `useCancelOrder` em `src/hooks/use-delivery-orders.ts` para receber `{ id, reason, category, customerNotified }` e gravar nas três colunas, expondo também `cancelOrderAsync` e `isCancellingOrder` para uso no diálogo (padrão idêntico ao `cancelComandaAsync`).

### 5. Relatório operacional do delivery

No `ReportsTab` do delivery (relatório do caixa/operacional), adicionar nova seção **"Pedidos cancelados"** filtrável pelo mesmo range de datas já existente, com colunas:

- Data/hora do cancelamento (`cancelled_at`)
- Nº do pedido
- Cliente
- Valor
- Operador que cancelou (campo novo: `cancelled_by_user_id`, gravado pela mutation a partir de `auth.uid()`)
- Motivo (texto)
- Categoria (label legível em pt-BR)
- "Cliente informado?" (Sim/Não)

Migration adiciona também `cancelled_by_user_id uuid NULL` em `delivery_orders` para esse propósito.

### 6. Tipos e i18n

- Atualizar `DeliveryOrder` interface no hook com os 3 novos campos.
- Labels em pt-BR das categorias compartilhadas em um util único (`src/lib/cancel-reasons.ts`) para Salão e Delivery usarem.

### Fora do escopo

- Notificar o cliente automaticamente via WhatsApp (apenas registramos o flag de que ele foi avisado pelo operador).
- Cancelamento parcial de itens do pedido.
- Mudanças no fluxo público do cliente (sem alteração na rota pública do pedido).

### Detalhes técnicos

```text
delivery_orders (novos campos):
  cancellation_category   text NULL
  customer_notified       boolean NOT NULL DEFAULT false
  cancelled_by_user_id    uuid  NULL
```

```text
src/components/pdv/cashier/CancelOrderDialog.tsx        (novo, genérico)
src/components/pdv/cashier/CancelComandaDialog.tsx      (vira wrapper)
src/components/delivery/OrderDetailDialog.tsx           (usa novo dialog)
src/hooks/use-delivery-orders.ts                        (mutation expandida)
src/components/delivery/ReportsTab.tsx (ou reports/*)   (seção nova)
src/lib/cancel-reasons.ts                               (labels compartilhados)
```
