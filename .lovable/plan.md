# Corrigir numeração TMP- nos pedidos de delivery

## Causa

Os dois pedidos exibidos no caixa (`TMP-1780002109374-170` e `TMP-1780002101443-990`) foram criados às 21:01, mas o caixa só foi aberto às 21:08. Hoje a numeração sequencial (`#001`, `#002`, …) depende exclusivamente da RPC `delivery_assign_order_ticket`, chamada pelo cliente logo após o INSERT. Se naquele instante não há `pdv_cashier_sessions` aberto, a RPC retorna `NULL` e o pedido fica **permanentemente** com o `order_number` provisório `TMP-…`.

Além disso, o comentário do código (`src/hooks/use-delivery-customers.ts:242`) afirma que existe um trigger `BEFORE INSERT` que faz essa atribuição no servidor — esse trigger **não existe** em `public.delivery_orders` (confirmado em `pg_trigger`).

## Solução (banco de dados, sem mexer no frontend)

Duas mudanças complementares numa única migração:

### 1. Trigger `BEFORE INSERT` em `delivery_orders`

Cria `public.delivery_orders_assign_number()` (`SECURITY DEFINER`, `search_path=public`) que, quando `NEW.order_number` vem nulo **ou** começa com `TMP-`:

- procura sessão de caixa aberta do `NEW.user_id`;
- se existir, calcula `MAX(ticket_number)+1` para aquela sessão e preenche `cashier_session_id`, `ticket_number` e `order_number = lpad(ticket, 3, '0')`;
- se não existir caixa aberto, mantém o `TMP-…` (compatibilidade com a lógica atual).

Cria o trigger `trg_delivery_orders_assign_number BEFORE INSERT`.

### 2. Atribuição retroativa ao abrir o caixa

Cria `public.delivery_assign_pending_tickets(p_session_id uuid)` e um trigger `AFTER INSERT` em `pdv_cashier_sessions` que, para a sessão recém-aberta:

- seleciona todos os `delivery_orders` do mesmo `user_id` com `cashier_session_id IS NULL` **e** `status <> 'cancelled'`, ordenados por `created_at`;
- atribui `ticket_number` sequencial a partir de `MAX(ticket_number)+1` da sessão (que começa em 1);
- atualiza `cashier_session_id` e `order_number = lpad(..., 3, '0')`.

Isso resolve os dois pedidos atuais (eles ganham `#001` e `#002` da sessão atual assim que a migração rodar — o trigger só dispara em novas aberturas, então para os atuais a própria migração faz um `UPDATE` único usando a sessão `9ffc5817-…` já aberta).

### 3. Limpeza de comentário

Após a migração aplicada, removo do `src/hooks/use-delivery-customers.ts` a menção a "trigger BEFORE INSERT" para refletir que agora ele realmente existe (sem mudar comportamento).

## Detalhes técnicos

- `delivery_assign_order_ticket(uuid)` continua existindo como fallback (a chamada do client permanece — agora vira no-op na maioria dos casos porque o trigger já preencheu).
- Garante idempotência: o trigger só age quando `order_number IS NULL OR LIKE 'TMP-%'`.
- A atualização retroativa única (one-shot) dentro da migração corrige os pedidos `TMP-` já em fila do `user_id` `d9087102-…` na sessão `9ffc5817-…`.
- Nenhuma mudança em RLS, GRANTs ou tipos.

```text
INSERT delivery_orders ─► trigger BEFORE INSERT ─► tem caixa aberto?
                                                   ├─ sim → #001, #002…
                                                   └─ não → TMP-…
abrir caixa ──────────► trigger AFTER INSERT ─► TMP- pendentes viram #001…
```
