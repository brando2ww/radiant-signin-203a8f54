/**
 * Dados dos Relatórios de Compras.
 *
 * A query busca uma janela LARGA (lookback, default 12 meses) e o período
 * selecionado é aplicado em memória. Isso é de propósito: a métrica principal
 * do bloco de preço é "última compra vs compra anterior", e a compra anterior
 * quase sempre está FORA do período escolhido. Filtrar no servidor mataria a
 * base de comparação.
 *
 * Pelo mesmo motivo, fornecedor/categoria/insumo também são filtrados em
 * memória, e só start/end/lookback/tenant entram na queryKey.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import {
  fetchCatalogs, fetchPurchaseLines, fetchQuotationData, fetchReceiptEvents,
} from "@/lib/purchase-reports/fetchers";
import {
  applyFilters, buildAbc, buildDataQuality, buildKpis, buildLines,
  buildPriceSeries, buildPriceVariation, buildQuotations, buildReceiving, buildSuppliers,
} from "@/lib/purchase-reports/aggregate";
import { brtRange } from "@/lib/reports-data-source";
import { addDays, addMonths, dateOnly, prevDateWindow } from "@/lib/purchase-reports/dates";
import type {
  CatalogIngredient, CatalogSupplier, PurchaseReportFilters, PurchaseReportsData,
} from "@/lib/purchase-reports/types";

export function usePurchaseReports(filters: PurchaseReportFilters) {
  const { visibleUserId } = useEstablishmentId();
  const lookbackMonths = filters.lookbackMonths ?? 12;

  const start = dateOnly(filters.start);
  const end = dateOnly(filters.end);

  // Borda esquerda com folga de 90 dias: um pedido pode ter sido feito antes da
  // janela e entregue dentro dela, e é a data de entrega que posiciona a linha.
  const fetchFrom = useMemo(() => {
    const prev = prevDateWindow(filters.start, filters.end);
    const byLookback = addMonths(filters.start, -lookbackMonths);
    const earliest = byLookback < prev.start ? byLookback : prev.start;
    return dateOnly(addDays(earliest, -90));
  }, [filters.start, filters.end, lookbackMonths]);

  const linesQuery = useQuery({
    queryKey: ["purchase-report-lines", visibleUserId, fetchFrom, end],
    enabled: !!visibleUserId,
    queryFn: () => fetchPurchaseLines(visibleUserId!, fetchFrom, end),
  });

  const catalogQuery = useQuery({
    queryKey: ["purchase-report-catalog", visibleUserId],
    enabled: !!visibleUserId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchCatalogs(visibleUserId!),
  });

  // created_at é timestamptz: aqui vale brtRange, não as strings DATE acima.
  const { startISO, endISO } = useMemo(
    () => brtRange(filters.start, filters.end),
    [start, end], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const receiptQuery = useQuery({
    queryKey: ["purchase-report-receipts", visibleUserId, startISO, endISO],
    enabled: !!visibleUserId,
    queryFn: () => fetchReceiptEvents(visibleUserId!, startISO, endISO),
  });

  const suppliers: CatalogSupplier[] = catalogQuery.data?.suppliers ?? [];
  const ingredients: CatalogIngredient[] = catalogQuery.data?.ingredients ?? [];

  const data = useMemo<PurchaseReportsData | null>(() => {
    if (!linesQuery.data || !catalogQuery.data) return null;
    const all = buildLines(linesQuery.data, suppliers, ingredients, filters);
    const lines = applyFilters(all, filters);
    return {
      lines,
      kpis: buildKpis(lines),
      price: buildPriceVariation(lines, filters),
      suppliers: buildSuppliers(lines, suppliers),
      abc: buildAbc(lines),
      receiving: buildReceiving(lines, receiptQuery.data ?? []),
      dataQuality: buildDataQuality(lines, suppliers),
    };
    // `start`/`end` cobrem a identidade de filters.start/end sem recomputar a
    // cada render por causa de novas instâncias de Date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    linesQuery.data, catalogQuery.data, receiptQuery.data, start, end,
    filters.supplierIds?.join(","), filters.supplierCategories?.join(","),
    filters.ingredientIds?.join(","), filters.ingredientCategories?.join(","),
    filters.minPurchases, filters.minDeltaPct,
  ]);

  return {
    data,
    suppliers,
    ingredients,
    isLoading: linesQuery.isLoading || catalogQuery.isLoading,
    error: linesQuery.error ?? catalogQuery.error,
    /** Série de preço de um insumo: puro memo, sem query nova. */
    priceSeries: (key: string) => (data ? buildPriceSeries(data.lines, key) : null),
  };
}

/**
 * Bloco de cotações. Hook separado e sob demanda: são 4 queries que só a aba de
 * cotações usa, e carregá-las junto atrasaria a abertura da página.
 */
export function useQuotationAnalytics(
  filters: Pick<PurchaseReportFilters, "start" | "end">,
  enabled: boolean,
) {
  const { visibleUserId } = useEstablishmentId();
  const { startISO, endISO } = useMemo(
    () => brtRange(filters.start, filters.end),
    [dateOnly(filters.start), dateOnly(filters.end)], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const catalogQuery = useQuery({
    queryKey: ["purchase-report-catalog", visibleUserId],
    enabled: !!visibleUserId && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchCatalogs(visibleUserId!),
  });

  const query = useQuery({
    queryKey: ["purchase-report-quotations", visibleUserId, startISO, endISO],
    enabled: !!visibleUserId && enabled,
    queryFn: () => fetchQuotationData(visibleUserId!, startISO, endISO),
  });

  const block = useMemo(() => {
    if (!query.data) return null;
    return buildQuotations(
      query.data.requests,
      query.data.items,
      query.data.links,
      query.data.invites,
      catalogQuery.data?.suppliers ?? [],
    );
  }, [query.data, catalogQuery.data]);

  return { block, isLoading: query.isLoading };
}
