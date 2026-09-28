/**
 * Faturamento por hora do dia, para cruzar com o ponto.
 *
 * A receita sai de pdv_cashier_movements do tipo 'venda', que é a fonte única
 * de receita deste projeto (a mesma doutrina dos relatórios: pdv_orders.total
 * é zero e pdv_payments é incompleto).
 */
import { useQuery } from "@tanstack/react-query";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { fetchCashierSalesByPeriod } from "@/lib/reports-data-source";

export function useFaturamentoPorHora(competencia: string) {
  const { visibleUserId } = useEstablishmentId();

  const query = useQuery({
    queryKey: ["ponto-faturamento-hora", visibleUserId, competencia],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const inicio = new Date(`${competencia}-01T00:00:00`);
      const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0, 23, 59, 59, 999);
      const movimentos = await fetchCashierSalesByPeriod(
        visibleUserId!,
        inicio.toISOString(),
        fim.toISOString(),
      );

      const porHora = new Map<number, number>();
      let total = 0;
      for (const m of movimentos) {
        const h = new Date(m.created_at).getHours();
        porHora.set(h, (porHora.get(h) ?? 0) + m.amount);
        total += m.amount;
      }
      return {
        porHora: [...porHora.entries()].map(([hora, valor]) => ({ hora, valor })).sort((a, b) => a.hora - b.hora),
        total,
      };
    },
  });

  return {
    porHora: query.data?.porHora ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
  };
}
