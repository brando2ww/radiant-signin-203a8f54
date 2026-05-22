## Problema

Na tabela "Pedidos com desconto" do relatório `/pdv/relatorios?tab=discounts`, vários pedidos aparecem com `—` no lugar do nome do cliente (ex.: #006, #005, #003, #002 do dia 21/05).

## Causa

A query atual lê apenas `delivery_orders.customer_name`, que está vazio em parte dos pedidos (o checkout nem sempre persiste o nome direto no pedido). Porém esses pedidos têm `customer_id` preenchido apontando para `delivery_customers`, onde o nome existe.

Exemplo conferido no banco:
- Pedido #006 (21/05) → `customer_name=''` mas `customer_id` → "Michele Ceccagno"
- Pedido #005 (21/05) → vazio → "GRASIELE BENINI"
- Pedido #003 (21/05) → vazio → "Carolina Mosna"
- Pedido #002 (21/05) → vazio → "Luiza Mistorini"

## Correção

Editar somente `src/pages/pdv/reports/DiscountsReport.tsx`:

1. Incluir `customer_id` no `select` de `delivery_orders`.
2. Após buscar os pedidos com desconto, coletar os `customer_id` únicos cujo `customer_name` está vazio/null e fazer uma única consulta em `delivery_customers` (`select id, name`) com `.in('id', ids)`.
3. Montar um `Map<id, name>` e, ao mapear cada pedido para o shape da UI, usar:
   `displayName = customer_name?.trim() || customersMap.get(customer_id) || "—"`
4. Aplicar o mesmo `displayName` na exportação XLSX (abas "Descontos Diretos" e similares) para manter consistência.

Sem alterações em UI, layout, agregações por cupom, KPIs ou outros relatórios.

## Validação

Reabrir o relatório e conferir que os pedidos antes com `—` agora exibem o nome vindo de `delivery_customers` (Michele Ceccagno, GRASIELE BENINI, Carolina Mosna, Luiza Mistorini, etc.). Pedidos realmente sem cliente cadastrado continuam exibindo `—`.
