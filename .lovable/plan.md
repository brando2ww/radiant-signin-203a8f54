## Diagnóstico

Mesa 03 está travada como **ocupada** com 2 comandas mostrando R$ 118 mesmo após o caixa ser fechado:

- Order `1db3b38d…` continua `aberto`
- Ambas as comandas (`db1149f8…`, `fd520408…`) já estão `cancelada`
- Itens não têm `paid_quantity` (foram canceladas, não pagas)
- `pdv_tables.current_order_id` ainda aponta para o pedido

**Causa raiz**: a função `cancelComandaMutation` em `src/hooks/use-pdv-comandas.ts` (linhas 283–302) apenas marca uma comanda como `cancelada` via UPDATE direto. Ela **não** verifica se sobraram outras comandas abertas no mesmo pedido. Quando a última é cancelada, o `pdv_orders.status` continua `aberto` e a mesa nunca é liberada.

(O fluxo de transferência já trata isso corretamente — veja o final de `pdv_transfer_items` no banco. Cancelamento direto e fechamento por pagamento não tratam.)

## Plano

### 1. Migration — trigger de auto-liberação + cleanup

Criar um trigger `AFTER UPDATE` em `pdv_comandas` que, quando o status muda para um terminal (`cancelada` ou `fechada`):
- Verifica se ainda há comandas no mesmo `order_id` com status em (`aberta`, `aguardando_pagamento`, `em_cobranca`)
- Se não houver:
  - `pdv_orders.status = 'fechado'`, `closed_at = now()`
  - Libera a mesa: `pdv_tables.current_order_id = NULL`, `status = 'livre'` quando `current_order_id = order_id`

E um **cleanup one-shot** no mesmo migration: roda a mesma lógica sobre todos os pedidos hoje órfãos (todas as comandas terminais mas order/mesa ainda abertas), resolvendo a Mesa 03 imediatamente.

### 2. Frontend — invalidar queries no cancel

Em `cancelComandaMutation.onSuccess`, invalidar também `["pdv-orders"]` e `["pdv-tables"]` para refletir a liberação imediatamente.

## Arquivos

- `supabase/migrations/<timestamp>_auto_release_table_on_comanda_terminal.sql` (novo)
- `src/hooks/use-pdv-comandas.ts` (invalidações extras)

## Detalhes técnicos

- Trigger nomeado `pdv_comandas_auto_close_order` em `AFTER UPDATE OF status`, executando função `SECURITY DEFINER` com `search_path = public`.
- Considera terminais: `cancelada`, `fechada`. Considera abertas (mantém ordem aberta): `aberta`, `aguardando_pagamento`, `em_cobranca`.
- Cleanup escrito de forma idempotente (não toca pedidos já fechados).
