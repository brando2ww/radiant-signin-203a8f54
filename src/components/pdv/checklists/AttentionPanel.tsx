import { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  useEvidenceGallery,
  useReviewEvidence,
  type EvidenceItem,
  type EvidenceFilters,
} from "@/hooks/use-checklist-evidence";
import { toast } from "@/hooks/use-toast";

import { EvidenceFiltersBar } from "./evidence/EvidenceFilters";
import { EvidenceLightbox } from "./evidence/EvidenceLightbox";
import { EvidenceDayGroup } from "./evidence/EvidenceDayGroup";
import { getShift, SHIFTS, statusRank, type ShiftKey } from "./evidence/shift-utils";

export function AttentionPanel() {
  const [filters, setFilters] = useState<EvidenceFilters>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data: allEvidence, isLoading } = useEvidenceGallery(filters);
  const reviewMutation = useReviewEvidence();

  const updateFilters = useCallback((partial: Partial<EvidenceFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  // Pending critical/non-compliant items only — not approved/rejected
  const evidence = useMemo(() => {
    return (allEvidence || []).filter(
      (e) =>
        (e.isCritical || e.isCompliant === false) &&
        e.reviewStatus !== "aprovado" &&
        e.reviewStatus !== "reprovado",
    );
  }, [allEvidence]);

  const handleReview = async (id: string, status: "aprovado" | "reprovado", comment?: string) => {
    try {
      await reviewMutation.mutateAsync({ executionItemIds: id, status, comment });
      toast({ title: status === "aprovado" ? "Aprovado ✅" : "Reprovado ❌" });
    } catch {
      toast({ title: "Erro ao avaliar", variant: "destructive" });
    }
  };

  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.search ||
      (filters.sector && filters.sector !== "all") ||
      filters.operatorId ||
      filters.checklistId ||
      (filters.itemType && filters.itemType !== "all")
    );
  }, [filters]);

  const groupedByDayShift = useMemo(() => {
    if (!evidence.length)
      return [] as { date: string; shifts: { key: ShiftKey; items: { item: EvidenceItem; index: number }[] }[] }[];

    const byDate = new Map<string, Map<ShiftKey, { item: EvidenceItem; index: number }[]>>();
    evidence.forEach((item, index) => {
      const date = item.executionDate || "";
      const shift = getShift(item.completedAt);
      if (!byDate.has(date)) byDate.set(date, new Map());
      const shiftMap = byDate.get(date)!;
      if (!shiftMap.has(shift)) shiftMap.set(shift, []);
      shiftMap.get(shift)!.push({ item, index });
    });

    const sortItems = (arr: { item: EvidenceItem; index: number }[]) =>
      arr.sort((a, b) => {
        const ra = statusRank(a.item.reviewStatus);
        const rb = statusRank(b.item.reviewStatus);
        if (ra !== rb) return ra - rb;
        const at = a.item.completedAt || "";
        const bt = b.item.completedAt || "";
        return at < bt ? 1 : at > bt ? -1 : 0;
      });

    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, shiftMap]) => ({
        date,
        shifts: Array.from(shiftMap.entries())
          .map(([key, items]) => ({ key, items: sortItems(items) }))
          .sort((a, b) => SHIFTS[a.key].order - SHIFTS[b.key].order),
      }));
  }, [evidence]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <h2 className="text-lg font-semibold">Evidências que Precisam de Atenção</h2>
        <span className="text-xs text-muted-foreground">
          (críticas ou não conformes, ainda pendentes)
        </span>
      </div>

      <EvidenceFiltersBar
        filters={filters}
        onFiltersChange={updateFilters}
        viewMode="grid"
        onViewModeChange={() => {}}
        onExportZip={() => {}}
        onExportCsv={() => {}}
        exporting={false}
        hasData={!!evidence.length}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !evidence.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            <ShieldCheck className="h-10 w-10 mx-auto mb-2 text-green-600 dark:text-green-500 opacity-80" />
            <p className="font-medium text-foreground">Tudo em ordem 🎉</p>
            <p className="text-xs mt-1">Nenhuma evidência precisa de atenção no período selecionado.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {groupedByDayShift.map((group) => (
              <EvidenceDayGroup
                key={group.date || "sem-data"}
                date={group.date}
                shifts={group.shifts}
                hasActiveFilters={hasActiveFilters}
                onView={(idx) => setLightboxIndex(idx)}
                onApprove={(id) => handleReview(id, "aprovado")}
                onReject={(id) => handleReview(id, "reprovado")}
              />
            ))}
          </div>

          <EvidenceLightbox
            evidence={evidence}
            currentIndex={lightboxIndex ?? 0}
            open={lightboxIndex !== null}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
            onReview={handleReview}
            reviewing={reviewMutation.isPending}
          />
        </>
      )}
    </div>
  );
}
