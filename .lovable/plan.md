## Problema identificado

O relatório mensal está errado por dois motivos principais:

1. **A receita do PDV está vindo de `pdv_payments`**, mas essa tabela está incompleta para este sistema.
   - Em maio/2026: `pdv_payments` mostra **R$ 16.881,49**.
   - O caixa (`pdv_cashier_movements`, tipo `venda`) mostra **R$ 98.056,73** no mesmo mês.

2. **O campo “Pedidos” está exibindo IDs concatenados** porque o código está somando/exibindo um `Set` diretamente, em vez de usar `.size`.

Além disso, a tela mensal hoje soma apenas parte da operação. Para “receita total do sistema”, a fonte correta deve ser a movimentação financeira efetivamente registrada no caixa.

## Correção proposta

### 1. Definir a fonte única de receita total
Usar `pdv_cashier_movements` como fonte principal da receita do sistema:

- Filtrar `type = 'venda'`.
- Agrupar pela data de `created_at` do movimento.
- Vincular com `pdv_cashier_sessions.user_id = visibleUserId` para respeitar dono/funcionário.
- Separar canais por `source`:
  - `delivery` → Delivery
  - `salon`, `salao`, vazio ou outros → Salão/Balcão conforme disponível

Isso fará o relatório mensal mostrar a receita total real registrada no caixa, incluindo PDV e Delivery.

### 2. Ajustar o relatório “Mensal — Evolução e YoY”
Em `MonthlyReport.tsx`:

- Substituir a busca em `pdv_payments` por `pdv_cashier_movements` + `pdv_cashier_sessions`.
- Corrigir `currentOrders`, `prevOrders`, `currentTicket` e YoY para usar contagem numérica, não `Set`.
- Mostrar “Pedidos/Vendas” com base na quantidade de movimentos de venda ou pedidos vinculados quando houver identificador disponível.
- Manter “Itens vendidos” vindo de `pdv_comanda_items` e `delivery_order_items`, mas sem contaminar receita.
- Garantir que a tabela mensal não quebre layout com UUIDs.

### 3. Corrigir o hook de evolução mensal usado na Visão Geral
Em `use-pdv-monthly-revenue.ts`:

- Trocar `pdv_orders.total` por `pdv_cashier_movements.amount`.
- Remover dependência de `pdv_orders.total`, que está zerado.
- Incluir delivery pela mesma fonte do caixa quando `source = delivery`, evitando dupla contagem com `delivery_orders`.
- Preservar o gráfico por canais: Salão, Balcão e Delivery.

### 4. Padronizar os relatórios que ainda usam fonte parcial
Ajustar os relatórios já impactados para não misturarem fontes incorretas:

- `OverviewReport`
- `usePDVReports`
- `ByUserReport`
- `ProductsAnalyticsReport`
- `ByCategoryReport`

Regra:
- **Receita total financeira**: sempre `pdv_cashier_movements` tipo `venda`.
- **Itens/produtos/categorias**: `pdv_comanda_items` e `delivery_order_items`.
- Quando receita por produto/categoria não tiver vínculo financeiro perfeito, usar subtotal dos itens apenas como rateio operacional, não como “receita total do sistema”.

### 5. Criar utilitário central para evitar regressão
Criar/ajustar `src/lib/reports-data-source.ts` com funções reutilizáveis:

- `fetchCashierRevenueByPeriod(...)`
- `fetchCashierRevenueByMonth(...)`
- `fetchSystemItemsByPeriod(...)`

Assim todos os relatórios passam a usar a mesma fonte e a correção não fica espalhada.

### 6. Validação depois da implementação
Validar especificamente maio/2026:

- O mensal deve sair de **R$ 19.117,17** para refletir a receita do caixa: aproximadamente **R$ 98.056,73** em maio/2026.
- Abril/2026 deve refletir aproximadamente **R$ 27.790,76**.
- O campo “Pedidos” não pode mais mostrar UUIDs.
- Ticket médio deve voltar a calcular corretamente.

## Resultado esperado

A tela mensal passará a mostrar a **receita total real do sistema**, baseada no caixa, e os demais relatórios deixarão de puxar valores parciais/zerados de pedidos ou pagamentos incompletos.