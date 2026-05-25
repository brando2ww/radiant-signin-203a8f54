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
  const [open, setOpen] = useState(false);
  const shift = SHIFTS[shiftKey];
  const pending = items.filter(({ item }) => !item.reviewStatus || item.reviewStatus === "pendente").length;
  const approved = items.filter(({ item }) => item.reviewStatus === "aprovado").length;
  const rejected = items.filter(({ item }) => item.reviewStatus === "reprovado").length;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md hover:bg-muted transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-medium text-foreground">{shift.label}</span>
        <span className="text-xs text-muted-foreground">{shift.range}</span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Camera className="h-3 w-3" /> {items.length}
          </span>
          {pending > 0 && (
            <span className="inline-flex items-center gap-1 text-yellow-700 dark:text-yellow-500 font-medium">
              <CircleDot className="h-3 w-3" /> {pending}
            </span>
          )}
          {approved > 0 && (
            <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-500">
              <CheckCircle2 className="h-3 w-3" /> {approved}
            </span>
          )}
          {rejected > 0 && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <XCircle className="h-3 w-3" /> {rejected}
            </span>
          )}
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
