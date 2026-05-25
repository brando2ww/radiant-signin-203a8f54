import { useState } from "react";
import { ChevronDown, ChevronRight, Camera, CircleDot, CheckCircle2, XCircle } from "lucide-react";
import type { EvidenceItem } from "@/hooks/use-checklist-evidence";
import { EvidenceGridCard } from "./EvidenceGridCard";
import { SHIFTS, type ShiftKey } from "./shift-utils";

interface Props {
  shiftKey: ShiftKey;
  items: { item: EvidenceItem; index: number }[];
  onView: (index: number) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function EvidenceShiftGroup({ shiftKey, items, onView, onApprove, onReject }: Props) {
  const [open, setOpen] = useState(true);
  const shift = SHIFTS[shiftKey];
  const pending = items.filter(({ item }) => !item.reviewStatus || item.reviewStatus === "pendente").length;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md hover:bg-muted transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-medium text-foreground">{shift.label}</span>
        <span className="text-xs text-muted-foreground">{shift.range}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {pending > 0 && <span className="text-yellow-700 dark:text-yellow-500 font-medium">{pending} pendente{pending === 1 ? "" : "s"}</span>}
          <span>{items.length} {items.length === 1 ? "foto" : "fotos"}</span>
        </span>
      </button>

      {open && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pl-6">
          {items.map(({ item, index }) => (
            <EvidenceGridCard
              key={item.executionItemId}
              item={item}
              onView={() => onView(index)}
              onApprove={() => onApprove(item.executionItemId)}
              onReject={() => onReject(item.executionItemId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
