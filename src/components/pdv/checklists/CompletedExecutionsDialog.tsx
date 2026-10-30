import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, XCircle, AlertTriangle, Camera } from "lucide-react";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

type ExecStatus = "concluido" | "atrasado" | "nao_iniciado";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string; // YYYY-MM-DD
  status?: ExecStatus;
}

const STATUS_CONFIG: Record<ExecStatus, { title: string; orderField: string; emptyText: string }> = {
  concluido: { title: "Checklists concluídos", orderField: "completed_at", emptyText: "Nenhum checklist concluído neste dia." },
  atrasado: { title: "Checklists em atraso", orderField: "started_at", emptyText: "Nenhum checklist em atraso neste dia." },
  nao_iniciado: { title: "Checklists não iniciados", orderField: "created_at", emptyText: "Nenhum checklist não iniciado neste dia." },
};

export function CompletedExecutionsDialog({ open, onOpenChange, date, status = "concluido" }: Props) {
  const { visibleUserId } = useEstablishmentId();
  const cfg = STATUS_CONFIG[status];

  const { data: executions, isLoading } = useQuery({
    queryKey: ["status-executions", status, visibleUserId, date],
    enabled: !!visibleUserId && open,
    queryFn: async () => {
      let q = supabase
        .from("checklist_executions")
        .select("id, status, score, started_at, completed_at, checklists(name, sector), checklist_operators(name)")
        .eq("user_id", visibleUserId!)
        .eq("execution_date", date);
      if (status === "nao_iniciado") {
        q = q.in("status", ["pendente", "nao_iniciado", "em_andamento"]);
      } else {
        q = q.eq("status", status);
      }
      const { data, error } = await q.order(cfg.orderField, { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const formattedDate = (() => {
    try { return format(parseISO(date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }); }
    catch { return date; }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
          <DialogDescription>{formattedDate}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !executions || executions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              {cfg.emptyText}
            </p>
          ) : status === "nao_iniciado" ? (
            <div className="divide-y border rounded-md">
              {executions.map((exec: any) => (
                <div key={exec.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{exec.checklists?.name || "Checklist"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {exec.checklists?.sector || "—"} · {exec.checklist_operators?.name || "—"}
                      {exec.started_at && (
                        <> · iniciado {format(new Date(exec.started_at), "HH:mm", { locale: ptBR })}</>
                      )}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {exec.status === "em_andamento" ? "Em andamento" : "Não iniciado"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {executions.map((exec: any) => (
                <AccordionItem key={exec.id} value={exec.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-3 gap-3">
                      <div className="text-left min-w-0">
                        <p className="font-medium truncate">{exec.checklists?.name || "Checklist"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {exec.checklists?.sector || "—"} · {exec.checklist_operators?.name || "—"}
                          {(() => {
                            const ts = status === "concluido" ? exec.completed_at : (exec.started_at || exec.completed_at);
                            return ts ? <> · {format(new Date(ts), "HH:mm", { locale: ptBR })}</> : null;
                          })()}
                        </p>
                      </div>
                      {exec.score != null && (
                        <Badge variant="secondary" className="shrink-0">{exec.score}/100</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ExecutionItems executionId={exec.id} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExecutionItems({ executionId }: { executionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["execution-items", executionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_execution_items")
        .select("id, value, photo_url, photo_expired_at, is_compliant, completed_at, checklist_items(title, item_type, is_critical, is_required, requires_photo, sort_order)")
        .eq("execution_id", executionId);
      if (error) throw error;
      return (data || []).sort(
        (a: any, b: any) => (a.checklist_items?.sort_order ?? 0) - (b.checklist_items?.sort_order ?? 0)
      );
    },
  });

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-3">Sem itens registrados.</p>;
  }

  return (
    <div className="space-y-2">
      {data.map((it: any) => {
        const ci = it.checklist_items || {};
        const done = !!it.completed_at;
        return (
          <div
            key={it.id}
            className={`rounded-md border p-2.5 ${ci.is_critical ? "border-destructive/40" : ""}`}
          >
            <div className="flex items-start gap-2">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{ci.title || "Item"}</span>
                  {ci.is_critical && (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                      <AlertTriangle className="h-3 w-3" /> Crítico
                    </Badge>
                  )}
                  {ci.requires_photo && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Camera className="h-3 w-3" /> Foto
                    </Badge>
                  )}
                  {it.is_compliant === false && (
                    <Badge variant="destructive" className="text-[10px]">Não conforme</Badge>
                  )}
                </div>
                <ItemValue value={it.value} itemType={ci.item_type} />
                {it.photo_url && (
                  <a href={it.photo_url} target="_blank" rel="noreferrer">
                    <img
                      src={it.photo_url}
                      alt="Evidência"
                      className="mt-1 max-h-40 rounded-md border object-cover"
                      loading="lazy"
                    />
                  </a>
                )}
                {it.photo_expired_at && <p className="text-xs text-muted-foreground">Foto removida após o prazo de retenção. Resposta e revisão preservadas.</p>}
                {it.completed_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Respondido às {format(new Date(it.completed_at), "HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemValue({ value, itemType }: { value: any; itemType?: string }) {
  if (value === null || value === undefined || value === "") {
    return <p className="text-xs text-muted-foreground italic">Sem resposta</p>;
  }
  // jsonb may carry primitive or object
  let display: string;
  if (typeof value === "boolean") {
    display = value ? "Sim" : "Não";
  } else if (typeof value === "number") {
    display = String(value);
  } else if (typeof value === "string") {
    display = value;
  } else if (Array.isArray(value)) {
    display = value.join(", ");
  } else if (typeof value === "object") {
    if ("answer" in value) display = String((value as any).answer);
    else if ("text" in value) display = String((value as any).text);
    else display = JSON.stringify(value);
  } else {
    display = String(value);
  }

  return (
    <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
      <span className="text-xs text-muted-foreground mr-1">Resposta:</span>
      {display}
    </p>
  );
}
