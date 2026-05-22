## Problema

Em `/pdv/relatorios?tab=cancellations`, a coluna "Cliente" da tabela "Pedidos cancelados" mostra `—` na maioria das linhas porque `pdv_orders.customer_name` está vazio na maior parte dos pedidos cancelados (especialmente vindos do PDV/balcão).

## Causa

A query lê só `pdv_orders.customer_name`. Porém o nome geralmente fica em `pdv_comandas.customer_name` (ex.: "espera", "felipe", "Giuseppe", ou "Mesa Mesa 04"). Em alguns casos `pdv_orders.customer_id` também aponta para `pdv_customers`, mas raramente.

## Correção

Editar apenas `src/pages/pdv/reports/CancellationsReport.tsx`:

1. Após buscar os pedidos cancelados, fazer um único `supabase.from("pdv_comandas").select("order_id, customer_name").in("order_id", cancelIds)`.
2. Montar um `Map<order_id, comanda_customer_name>` (primeiro nome não vazio por pedido, ignorando strings só com "Mesa ..." quando houver alternativa real — mas se for o único disponível, usa mesmo assim).
3. Ao mapear cada pedido para `CancelOrder`, definir:
   `displayName = (o.customer_name?.trim()) || comandaNameMap.get(o.id) || "—"`
   e salvar em `customer_name`.
4. Aplicar o mesmo `displayName` na exportação XLSX (aba "Cancelamentos").

Sem alterações em KPIs, gráficos, agregações por motivo/usuário/item ou outros relatórios.

## Validação

Reabrir o relatório de cancelamentos e conferir que pedidos antes com `—` agora exibem nomes vindos de `pdv_comandas` (ex.: "espera", "Mesa Mesa 04", "Giuseppe"). Pedidos sem nenhum nome registrado continuam com `—`.
