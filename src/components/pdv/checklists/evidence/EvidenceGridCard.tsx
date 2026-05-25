import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Eye, MessageSquare, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { EvidenceItem } from "@/hooks/use-checklist-evidence";

interface Props {
  item: EvidenceItem;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
}

const statusBadgeClass: Record<string, string> = {
  pendente: "bg-yellow-500 text-yellow-950 hover:bg-yellow-500",
  aprovado: "bg-green-600 text-white hover:bg-green-600",
  reprovado: "bg-destructive text-destructive-foreground hover:bg-destructive",
};

const statusLabel: Record<string, string> = {
  pendente: "Pendente",
  aprovado: "Aprovada",
  reprovado: "Reprovada",
};

export function EvidenceGridCard({ item, onView, onApprove, onReject }: Props) {
  const status = item.reviewStatus || "pendente";
  const time = item.completedAt ? format(new Date(item.completedAt), "HH:mm") : "--:--";

  return (
    <Card
      className="cursor-pointer overflow-hidden group transition-all hover:ring-2 hover:ring-primary flex flex-col"
      onClick={onView}
    >
      <div className="aspect-[4/5] relative overflow-hidden bg-muted">
        <img
          src={item.photoUrl}
          alt={item.itemTitle}
          className="w-full h-full object-cover"
          loading="lazy"
        />

        <Badge className={`absolute top-2 right-2 text-[10px] font-semibold ${statusBadgeClass[status]}`}>
          {statusLabel[status]}
        </Badge>

        {item.isCritical && (
          <Badge variant="destructive" className="absolute top-2 left-2 text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" />
            Crítico
          </Badge>
        )}

        {item.reviewComment && (
          <div
            className="absolute bottom-2 right-2 h-6 w-6 rounded-full bg-background/90 border border-border flex items-center justify-center"
            title={item.reviewComment}
          >
            <MessageSquare className="h-3.5 w-3.5 text-foreground" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button size="icon" variant="secondary" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onView(); }}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="default" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onApprove(); }}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="destructive" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onReject(); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CardContent className="p-2.5 space-y-0.5">
        <p className="text-xs font-medium leading-tight line-clamp-2 min-h-[2rem]">{item.itemTitle}</p>
        <p className="text-[11px] text-foreground/80 truncate">
          {item.operatorName || "—"} • {time}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">{item.checklistName}</p>
      </CardContent>
    </Card>
  );
}
