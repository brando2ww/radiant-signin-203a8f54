## Diagnóstico

O DRE atual mostra Receita Bruta R$ 0 mas Cancelamentos R$ 1.036,72 porque o hook tem filtros desalinhados com os dados reais do projeto.

Inspeção em maio/2026:
- `pdv_orders.status` usa `fechada / aberta / fechado / cancelada` — o hook procura `closed`, então nada bate.
- `delivery_orders.status` usa `completed / cancelled` — o hook procura `delivered`, perdendo R$ 32k de delivery; mas pega cancelled corretamente (daí o R$ 1.036,72 aparecer).
- `pdv_orders.subtotal/total/discount` estão sempre 0 neste tenant — não dá pra somar daí.
- A fonte real de faturamento PDV é `pdv_cashier_sessions.total_sales` (R$ 94.947, igual ao Demonstrativo de Caixa) ou `pdv_cashier_movements` type='venda' (R$ 98.056).
- A query de CMV tem `.in("order_id", [...empty strings])` (sempre vazia) e a busca de itens não filtra por status nem por user_id.

## Plano de correção (`src/hooks/use-pdv-dre.ts`)

Reescrever as queries para alinhar com os dados reais e com os outros relatórios já existentes.

### 1. Receita Bruta
- **Vendas PDV** = soma de `pdv_cashier_sessions.total_sales` do usuário com `opened_at` no mês selecionado (mesma fonte do Demonstrativo de Caixa).
- **Vendas Delivery** = soma de `delivery_orders.total` com `status='completed'` (corrigido) e `created_at` no mês.

### 2. Deduções
- **Descontos PDV** = soma de descontos via `pdv_payments` (campo `gross_amount - amount` quando aplicável) ou, como fallback, `pdv_orders.discount` para `status IN ('fechada','fechado')` no mês. Usaremos a abordagem do `CancellationsReport`: agregar a partir de `pdv_payments` dos pedidos fechados (helper já existente — replicar a query).
- **Descontos Delivery** = soma de `delivery_orders.discount` com `status='completed'`.
- **Cancelamentos PDV** = soma do valor dos itens (`pdv_order_items.subtotal`) dos pedidos `status='cancelada'` no mês (mesma lógica do `CancellationsReport`). Quando vazio, retorna 0.
- **Cancelamentos Delivery** = soma de `delivery_orders.total` com `status='cancelled'` (manter).
- **Taxas de meios de pagamento** = manter `pdv_payments.fee_amount` (joinando com pdv_orders do mês via `processed_at` em vez de filtro por order_ids fechados), mais `pdv_financial_transactions.fee_amount` para `transaction_type='receivable'` e `status='paid'` no mês.

### 3. Receita Líquida
`netRevenue = grossRevenue - (descontos + cancelamentos + taxas)`.

### 4. CMV
- Remover a query quebrada com `[...map(() => "")]`.
- Buscar `pdv_order_items` filtrando por `order_id IN (ids dos pedidos fechados do mês do usuário)` em uma única chamada.
- Construir `recipeCostMap[product_id]` a partir de `pdv_product_recipes` × `pdv_ingredients.unit_cost`.
- Fallback: quando o produto não tem receita, usar `pdv_products.cost` (buscar em batch pelos `product_id` distintos dos itens).
- `cmv = Σ quantity × custo_unitário`. Se não houver itens (caso deste tenant), retorna 0 sem erro.

### 5. Lucro Bruto
`grossProfit = netRevenue - cmv`.

### 6. Despesas Operacionais
Manter via `pdv_financial_transactions` (`transaction_type='payable'`, `status='paid'`, `payment_date` no mês), agrupado por `pdv_chart_of_accounts.name`. Sem mudanças.

### 7. Lucro Operacional / Líquido
`operatingProfit = grossProfit - totalExpenses`; `netProfit = operatingProfit` (mantém simplificação atual; pode-se adicionar IR/CSLL no futuro).

### 8. Margens
`marginGross / marginOperating / marginNet` calculadas sobre `grossRevenue` (mantém).

## Sem mudanças

- UI `src/pages/pdv/financial/DRE.tsx` — todos os campos exibidos continuam existindo no retorno do hook.
- Schema do banco.
- Outros relatórios.

## Validação

Em maio/2026 (dados do print) o resultado esperado passa a ser:
- Receita Bruta ≈ R$ 94.947 (PDV) + R$ 32.133 (Delivery) = ~R$ 127.080.
- Deduções: descontos atuais + R$ 1.036,72 (cancelamentos delivery) + taxas.
- Receita Líquida positiva; Lucro Bruto e Operacional coerentes com despesas pagas no mês.
- Conferir contra o Demonstrativo de Caixa (PDV) e o relatório de delivery para garantir consistência.
