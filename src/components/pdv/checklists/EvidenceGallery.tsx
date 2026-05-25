import { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Image as ImageIcon } from "lucide-react";
import { useEvidenceGallery, useReviewEvidence, type EvidenceItem, type EvidenceFilters } from "@/hooks/use-checklist-evidence";
import { toast } from "@/hooks/use-toast";
import JSZip from "jszip";
import { saveAs } from "file-saver";

import { EvidenceOverview } from "./evidence/EvidenceOverview";
import { EvidenceFiltersBar } from "./evidence/EvidenceFilters";
import { EvidenceLightbox } from "./evidence/EvidenceLightbox";
import { EvidenceListView } from "./evidence/EvidenceListView";
import { EvidenceDayGroup } from "./evidence/EvidenceDayGroup";
import { getShift, SHIFTS, statusRank, type ShiftKey } from "./evidence/shift-utils";


export function EvidenceGallery() {
  const [filters, setFilters] = useState<EvidenceFilters>({});
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: evidence, isLoading } = useEvidenceGallery(filters);
  const reviewMutation = useReviewEvidence();

  const updateFilters = useCallback((partial: Partial<EvidenceFilters>) => {
    setFilters(prev => ({ ...prev, ...partial }));
  }, []);

  const handleReview = async (id: string, status: "aprovado" | "reprovado", comment?: string) => {
    try {
      await reviewMutation.mutateAsync({ executionItemIds: id, status, comment });
      toast({ title: status === "aprovado" ? "Aprovado ✅" : "Reprovado ❌" });
    } catch {
      toast({ title: "Erro ao avaliar", variant: "destructive" });
    }
  };

  const handleBatchReview = async (ids: string[], status: "aprovado" | "reprovado") => {
    try {
      await reviewMutation.mutateAsync({ executionItemIds: ids, status });
      toast({ title: `${ids.length} evidência(s) ${status === "aprovado" ? "aprovadas" : "reprovadas"}` });
    } catch {
      toast({ title: "Erro ao avaliar em lote", variant: "destructive" });
    }
  };

  const handleExportZip = async () => {
    if (!evidence?.length) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      for (const item of evidence) {
        try {
          const res = await fetch(item.photoUrl);
          const blob = await res.blob();
          const name = `${item.executionDate}_${item.operatorName}_${item.itemTitle}.jpg`.replace(/\s+/g, "_");
          zip.file(name, blob);
        } catch { /* skip */ }
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `evidencias_${rangeSuffix()}.zip`);
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const rangeSuffix = () => {
    const from = filters.dateFrom || filters.date;
    const to = filters.dateTo || filters.date;
    if (from && to) return from === to ? from : `${from}_a_${to}`;
    if (from) return `desde_${from}`;
    if (to) return `ate_${to}`;
    return "todas";
  };

  const handleExportCsv = () => {
    if (!evidence?.length) return;
    const header = "Data,Colaborador,Checklist,Item,Setor,Tipo,Status,Comentário,Crítico,Conforme\n";
    const rows = evidence.map(e =>
      [e.executionDate, e.operatorName, e.checklistName, e.itemTitle, e.sector, e.itemType, e.reviewStatus || "pendente", e.reviewComment || "", e.isCritical ? "Sim" : "Não", e.isCompliant === false ? "Não" : "Sim"]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `evidencias_metadados_${rangeSuffix()}.csv`);
  };


  const openLightboxForItem = (item: EvidenceItem) => {
    const idx = evidence?.findIndex(e => e.executionItemId === item.executionItemId) ?? -1;
    if (idx >= 0) setLightboxIndex(idx);
  };

  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.search ||
      (filters.sector && filters.sector !== "all") ||
      filters.operatorId ||
      filters.checklistId ||
      (filters.status && filters.status !== "all") ||
      (filters.itemType && filters.itemType !== "all")
    );
  }, [filters]);

  const groupedByDayShift = useMemo(() => {
    if (!evidence?.length) return [] as {
      date: string;
      shifts: { key: ShiftKey; items: { item: EvidenceItem; index: number }[] }[];
    }[];

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
      <h2 className="text-lg font-semibold">Galeria de Evidências</h2>

      <EvidenceFiltersBar
        filters={filters}
        onFiltersChange={updateFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onExportZip={handleExportZip}
        onExportCsv={handleExportCsv}
        exporting={exporting}
        hasData={!!evidence?.length}
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !evidence?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>Nenhuma evidência encontrada no período selecionado.</p>
          <p className="text-xs mt-1">As fotos aparecem aqui conforme a equipe executa os checklists.</p>
        </CardContent></Card>
      ) : (
        <>
          <EvidenceOverview evidence={evidence} />



          {viewMode === "grid" ? (
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
          ) : (

            <EvidenceListView
              evidence={evidence}
              onView={idx => setLightboxIndex(idx)}
              onBatchReview={handleBatchReview}
              reviewing={reviewMutation.isPending}
            />
          )}

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
