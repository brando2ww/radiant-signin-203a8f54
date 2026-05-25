import { useState } from "react";
import { ChevronDown, ChevronRight, Calendar, Camera, CircleDot, CheckCircle2, XCircle } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const totalPhotos = shifts.reduce((acc, s) => acc + s.items.length, 0);
  const totalPending = shifts.reduce(
    (acc, s) => acc + s.items.filter(({ item }) => !item.reviewStatus || item.reviewStatus === "pendente").length,
    0,
  );
  const totalApproved = shifts.reduce(
    (acc, s) => acc + s.items.filter(({ item }) => item.reviewStatus === "aprovado").length,
    0,
  );
  const totalRejected = shifts.reduce(
    (acc, s) => acc + s.items.filter(({ item }) => item.reviewStatus === "reprovado").length,
    0,
  );

  const presentShifts = new Set(shifts.map((s) => s.key));
  const missingShifts = (Object.keys(SHIFTS) as ShiftKey[]).filter((k) => !presentShifts.has(k));

  return (
    <section className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-muted transition-colors ${open ? "bg-muted/60 border-b border-border" : ""}`}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <h3 className="text-sm font-semibold text-foreground capitalize truncate">{formatDateHeader(date)}</h3>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-foreground">
            <Camera className="h-3 w-3" /> {totalPhotos}
          </span>
          {totalPending > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-700 dark:text-yellow-500 text-xs font-medium">
              <CircleDot className="h-3 w-3" /> {totalPending}
            </span>
          )}
          {totalApproved > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-600/15 text-green-700 dark:text-green-500 text-xs">
              <CheckCircle2 className="h-3 w-3" /> {totalApproved}
            </span>
          )}
          {totalRejected > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 text-destructive text-xs">
              <XCircle className="h-3 w-3" /> {totalRejected}
            </span>
          )}
        </div>
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
