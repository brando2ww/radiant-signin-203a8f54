Plano para a seção "Relatórios de Entregadores" abaixo da grade existente em `/pdv/delivery/entregadores`:

1. Criar `src/hooks/use-driver-reports.ts` — busca em `delivery_orders` os pedidos com `driver_id` no período selecionado (padrão últimos 30 dias) e devolve agregações por entregador:
   - entregas concluídas, em rota e canceladas
   - faturamento gerado (R$), soma de taxas de entrega (R$)
   - ticket médio
   - tempo médio de rota (de `driver_assigned_at` → `delivered_at`)
   - distribuição de entregas por dia (timeline)
   - distribuição por dia da semana e por faixa de horário (Madrugada/Manhã/Tarde/Noite)
   - ranking de melhor entregador (por volume e por tempo)

2. Criar `src/components/delivery/drivers/DriverReports.tsx` com:
   - Filtro de período (7/30/90 dias) e seletor opcional de entregador.
   - KPIs globais: total de entregas, taxa de cancelamento, faturamento, taxas de entrega arrecadadas, tempo médio de rota, melhor entregador.
   - Gráfico de barras "Entregas por dia" (recharts).
   - Gráfico "Entregas por dia da semana" e barras horizontais "Por faixa de horário".
   - Tabela "Desempenho por entregador" com: nome, entregas, em rota, canceladas, faturamento, taxas, ticket médio, tempo médio.

3. Renderizar `<DriverReports />` em `Drivers.tsx` abaixo do grid de cards (com `mt-10` e um título de seção).

4. Tudo usando tokens do design system, `formatBRL`, `date-fns` com `ptBR`, sem cores customizadas.