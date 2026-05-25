import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { EvidenceItem } from "@/hooks/use-checklist-evidence";
import { EvidenceShiftGroup } from "./EvidenceShiftGroup";
import { SHIFTS, type ShiftKey } from "./shift-utils";

interface Props {
  date: string;
  shifts: { key: ShiftKey; items: { item: EvidenceItem; index: number }[] }[];
  hasActiveFilters: boolean;
  onView: (index: number) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

function formatDateHeader(dateStr: string): string {
  if (!dateStr) return "Sem data";
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Hoje";
    if (isYesterday(d)) return "Ontem";
    return format(d, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function EvidenceDayGroup({ date, shifts, hasActiveFilters, onView, onApprove, onReject }: Props) {
  const [open, setOpen] = useState(true);
  const totalPhotos = shifts.reduce((acc, s) => acc + s.items.length, 0);
  const totalPending = shifts.reduce(
    (acc, s) => acc + s.items.filter(({ item }) => !item.reviewStatus || item.reviewStatus === "pendente").length,
    0,
  );

  const presentShifts = new Set(shifts.map((s) => s.key));
  const missingShifts = (Object.keys(SHIFTS) as ShiftKey[]).filter((k) => !presentShifts.has(k));

  return (
    <section className="space-y-3 border border-border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left px-3 py-2.5 bg-muted/40 hover:bg-muted transition-colors border-b border-border"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <h3 className="text-sm font-semibold text-foreground capitalize">{formatDateHeader(date)}</h3>
        <span className="ml-auto flex items-center gap-3 text-xs">
          {totalPending > 0 && (
            <span className="text-yellow-700 dark:text-yellow-500 font-medium">
              {totalPending} pendente{totalPending === 1 ? "" : "s"}
            </span>
          )}
          <span className="text-muted-foreground">
            {totalPhotos} {totalPhotos === 1 ? "foto" : "fotos"}
          </span>
        </span>
      </button>

      {open && (
        <div className="p-3 space-y-4">
          {shifts.map((s) => (
            <EvidenceShiftGroup
              key={s.key}
              shiftKey={s.key}
              items={s.items}
              onView={onView}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}

          {hasActiveFilters && missingShifts.length > 0 && (
            <p className="text-xs text-muted-foreground italic pl-6">
              Sem evidências para o turno{missingShifts.length > 1 ? "s" : ""} da{" "}
              {missingShifts.map((k) => SHIFTS[k].label).join(", ")} com os filtros atuais.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
