Plano para o modal de análise de uso de cupons:

1. Tornar a célula "Uso" do `CouponRow.tsx` clicável (sem expansão inline) — abre um novo dialog `CouponAnalyticsDialog`. Mantém o resto da linha como hoje, mas remove (ou desativa) a expansão para evitar redundância.

2. Criar `src/components/delivery/coupons/CouponAnalyticsDialog.tsx` — modal grande com visão de gestor sobre o cupom selecionado:
   - Cabeçalho: código, % / valor de desconto, validade, status.
   - KPIs: usos totais, % do limite, economia gerada (R$), ticket médio dos pedidos com cupom, faturamento gerado, primeiro/último uso.
   - Gráfico de uso por dia (últimos 30 dias) — usa `recharts` (BarChart).
   - Distribuição por dia da semana e por faixa de horário (manhã/tarde/noite/madrugada).
   - Top 5 clientes que mais usaram.
   - Tabela com o histórico recente (reutilizando dados de `useCouponUsageHistory`).

3. Estender o hook ou criar `use-coupon-analytics.ts` que reaproveita a query existente em `delivery_orders` (filtrando por `coupon_code` + `user_id`) e devolve as séries agregadas no client (datas, dia da semana, faixa horária, clientes).

4. Garantir uso de `formatBRL`, locale `ptBR` para datas e cores semânticas do design system (sem cores customizadas).

Resultado: clicar na coluna "Uso" do cupom abre um modal de análise rico, sem alterar lógica de negócio.