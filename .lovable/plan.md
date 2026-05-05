## Objetivo

Cada pedido recebe um número sequencial por turno (caixa aberto), no formato `#001`, `#002`, etc. Todas as comandas e impressões da MESMA mesa compartilham o mesmo número, mesmo quando os itens são roteados para impressoras diferentes (cozinha, bar, etc.). Ao fechar/reabrir o caixa, a contagem reinicia do `#001`.

## Como vai funcionar

- O número fica vinculado ao `pdv_orders` (a "comanda mestre" de uma mesa).
- Quando a primeira comanda/item é criada para uma mesa, o sistema reserva o próximo número da sessão de caixa atual.
- Comandas adicionais na mesma mesa (avulsas, divididas) reutilizam o mesmo número, pois compartilham o mesmo `order_id`.
- A impressão da cozinha mostra `Pedido #001` no cabeçalho, independente da impressora.

## Mudanças no banco (migração)

1. Adicionar colunas em `pdv_orders`:
   - `cashier_session_id uuid` (FK para `pdv_cashier_sessions`)
   - `ticket_number int`
   - Índice único parcial `(cashier_session_id, ticket_number)` para evitar duplicidade.

2. Função `public.pdv_assign_order_ticket(p_order_id uuid)`:
   - `SECURITY DEFINER`. Se o pedido já tem `ticket_number`, retorna o existente (idempotente).
   - Caso contrário: localiza a sessão de caixa aberta do owner (`pdv_cashier_sessions WHERE closed_at IS NULL`), faz `SELECT ... FOR UPDATE` na sessão, calcula `MAX(ticket_number)+1` para aquela sessão e grava em `pdv_orders`.
   - Se não houver sessão aberta, retorna `NULL` (e a impressão cai no order_number atual como fallback).

3. Recriar a view `vw_print_bridge_comanda_items` incluindo `o.ticket_number`.

## Mudanças no app

4. `src/hooks/use-pdv-comandas.ts`:
   - Após criar/reutilizar `effectiveOrderId` (linha ~162 e ~188), chamar `supabase.rpc('pdv_assign_order_ticket', { p_order_id: effectiveOrderId })`.
   - No `sendToKitchenMutation` (linhas ~578–599), incluir `ticket_number: first.ticket_number` no payload.

5. `src/hooks/use-pdv-orders.ts` (`createOrder`, linha ~104): após `insert`, chamar a mesma RPC com o id retornado.

6. `print-bridge/server.js` (linhas ~257–266):
   - Substituir `Pedido #${p.order_number}` pelo formato curto: se `p.ticket_number` existe → `Pedido #${String(p.ticket_number).padStart(3,'0')}`; senão fallback para `p.order_number`.

## Arquivos editados

- `supabase/migrations/<novo>.sql` (colunas, função RPC, recriar view)
- `src/hooks/use-pdv-comandas.ts`
- `src/hooks/use-pdv-orders.ts`
- `print-bridge/server.js` (lembrete: atualizar a máquina do bridge e reiniciar o serviço)

## Observações

- Comandas avulsas no balcão (mesa virtual) continuam compartilhando o mesmo `order_id` aberto da mesa virtual, então também receberão o mesmo número até o caixa fechar — se preferir um número por comanda avulsa do balcão, me avise antes da implementação.
- Se a venda for criada com o caixa fechado, `ticket_number` fica `NULL` e a impressão usa o número antigo (`order_number`) como fallback.
