## Problema

O pedido vindo do delivery ficou com `order_number = TMP-1778180726276-852` em vez de `#001` / sequencial do caixa.

Confirmei no banco:
- O pedido `f69929d2…` foi inserido com `status = 'preparing'` (auto-aceite ok), mas `cashier_session_id` e `ticket_number` ficaram `NULL`.
- O caixa `6c939cfb…` está aberto para esse `user_id` desde 16:43 — ou seja, havia caixa válido, mas a numeração nunca foi atribuída.
- A atribuição depende hoje da RPC `delivery_assign_order_ticket` chamada pelo cliente **após** o INSERT, dentro de um `try/catch` silencioso em `useCreateOrder`. Quando essa segunda chamada falha (rede, RLS, race), o pedido fica eternamente como `TMP-…`.

Ou seja, a numeração é frágil porque é feita em duas etapas no cliente.

## Solução

Mover a atribuição do número sequencial para **dentro do mesmo trigger BEFORE INSERT** que já roda no servidor (`auto_accept_delivery_order`). Assim, no momento em que a linha é gravada, ela já sai com `cashier_session_id`, `ticket_number` e `order_number = '001'` corretos — sem depender de uma segunda chamada do cliente.

### Mudanças

1. **Migration SQL** — substituir o trigger `auto_accept_delivery_order` por uma versão que, além de marcar `status='preparing'` quando há caixa aberto, também:
   - resolve o caixa aberto do `user_id` (mesma lógica atual);
   - calcula `next_ticket = COALESCE(MAX(ticket_number),0)+1` filtrando pelo `cashier_session_id` da sessão;
   - preenche `NEW.cashier_session_id`, `NEW.ticket_number` e `NEW.order_number = lpad(next_ticket::text, 3, '0')`;
   - executa essa atribuição **mesmo quando `auto_accept_orders` está desligado** (a numeração não deve depender do auto-aceite — basta haver um caixa aberto).

   Quando não houver caixa aberto, o trigger não toca em `order_number` e o placeholder `TMP-…` enviado pelo cliente permanece (comportamento atual de fallback preservado).

2. **Backfill** do pedido órfão atual:
   ```sql
   SELECT public.delivery_assign_order_ticket('f69929d2-5074-472f-97a2-e8a6ce6dc471');
   ```
   (a RPC continua existindo como fallback / reparo manual).

3. **Cliente** (`src/hooks/use-delivery-customers.ts`) — manter a chamada à RPC `delivery_assign_order_ticket` apenas como fallback defensivo: se após o INSERT o `order.order_number` ainda começar com `TMP-`, então chamar a RPC. Caso contrário, pular. Isso evita o round-trip extra no caminho feliz.

### Detalhes técnicos

- O trigger continua `BEFORE INSERT` para poder mutar `NEW`.
- Concorrência: usar `SELECT … FOR UPDATE` na linha de `pdv_cashier_sessions` correspondente para serializar a leitura/escrita do `MAX(ticket_number)` por sessão (mesma estratégia da RPC atual).
- O índice único `uq_delivery_orders_session_ticket(cashier_session_id, ticket_number)` já existe e protege contra duplicatas.
- A RPC `delivery_assign_order_ticket` permanece inalterada (reparo manual + fallback do cliente).
- Sem alteração nos tipos do Supabase nem em outras telas — o resto do app já lê `order_number`.

## Resultado esperado

Próximos pedidos do delivery (com caixa aberto) entram já com `order_number = '001'`, `'002'`, … e `ticket_number` preenchido, exibidos corretamente como `#001` no painel do PDV e na impressão.
