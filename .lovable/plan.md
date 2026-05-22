## Por que nada aparece em "Produtos"

A aba está zerada porque o hook `useProductAnalytics` lê de `pdv_order_items` (vazia neste banco — só 0 linhas no período) em vez de `pdv_comanda_items`, que é onde os itens realmente vivem (1.989 itens / R$ 68.842 em maio/2026 confirmado).

Mesma raiz do problema já resolvido nos outros relatórios: os dados de venda passam por `pdv_comandas` → `pdv_comanda_items`; `pdv_order_items` está deprecada.

## Correção (escopo: hook de analytics + filtro de período)

### `src/hooks/reports/use-product-analytics.ts`

1. **Trocar fonte dos itens PDV** de `pdv_order_items` para:
   ```
   pdv_comanda_items
     ↳ comanda:pdv_comandas!inner(order_id, created_at, status,
         order:pdv_orders!inner(id, order_number, user_id, status, source, closed_at, opened_at))
   ```
2. **Filtro de período**: por `comanda.created_at` no intervalo (mais confiável que `closed_at`, que muitas vezes está nulo). Manter `order.status in ('fechada','fechado')` e `order.user_id = visibleUserId`.
3. **Channel filter** continua via `order.source`. Reaproveitar `channelOfSource` de `reports-data-source.ts` para aceitar `salao`/`salon`.
4. **Heatmap por horário e série diária**: usar `comanda.created_at` (era `order.closed_at`).
5. **Modificadores**: lidos de `pdv_comanda_items.modifiers` (mesma coluna JSONB).
6. **Período anterior (delta)**: aplicar a mesma troca para `prevPdv`.
7. **Delivery**: mantém `delivery_order_items` como hoje (já correto).
8. **Cancelados**: hoje lê `pdv_orders.pdv_order_items`. Trocar para `pdv_orders.pdv_comandas.pdv_comanda_items` no mesmo select aninhado, filtrando `status='cancelada'` por `cancelled_at`.
9. **Totais de pedidos distintos**: contar `order.id` distintos vindos das duas fontes.

Sem mudanças em `ProductsAnalyticsReport.tsx` (UI permanece igual; apenas os dados passam a chegar).

### Validação
- May/2026 deve passar a mostrar ~R$ 68.8k de receita de itens, ~1.989 itens, ~227 pedidos.
- Curva ABC, Ranking, Margem, Tendência, Canais e Horários todos populados.
- "Receita" aqui é a soma de `pdv_comanda_items.subtotal` (verdade operacional por produto), diferente da "Receita financeira" do `pdv_cashier_movements` usada na Visão Geral — isso é esperado e está alinhado com a regra já registrada nos outros relatórios.
