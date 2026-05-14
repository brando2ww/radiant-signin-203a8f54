import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { ExecutionTimer } from "./ExecutionTimer";
import { ExecutionItemRenderer, type ChecklistItemData } from "./ExecutionItemRenderer";
import { useChecklistExecution } from "@/hooks/use-checklist-execution";
import { toast } from "@/hooks/use-toast";

interface ChecklistExecutionPageProps {
  executionId: string;
  userId: string;
  onBack: () => void;
  onComplete: () => void;
}

export function ChecklistExecutionPage({ executionId, userId, onBack, onComplete }: ChecklistExecutionPageProps) {
  const { loadExecution, saveItemValue, completeExecution, createAlert, acknowledgeAlertsForItem } = useChecklistExecution(userId);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [alertedItems, setAlertedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadExecution(executionId).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [executionId, loadExecution]);

  const handleSave = useCallback(
    async (execItemId: string, value: any, photoUrl: string | null, isCompliant: boolean | null) => {
      await saveItemValue(execItemId, value, photoUrl, isCompliant);

      // Update local state (functional update to avoid stale closure)
      let savedItem: ChecklistItemData | undefined;
      setData((prev: any) => {
        if (!prev) return prev;
        const items = prev.items.map((it: ChecklistItemData) => {
          if (it.executionItemId !== execItemId) return it;
          const updated = { ...it, value, photo_url: photoUrl, is_compliant: isCompliant, completed_at: new Date().toISOString() };
          savedItem = updated;
          return updated;
        });
        return { ...prev, items };
      });

      // Auto-alert for out of range
      if (isCompliant === false && !alertedItems.has(execItemId) && savedItem) {
        const alertType = savedItem.item_type === "temperature" ? "temperatura_fora" as const : "item_critico" as const;
        await createAlert(executionId, savedItem.id, alertType, `${savedItem.title}: valor ${value} fora da faixa (${savedItem.min_value ?? "—"} a ${savedItem.max_value ?? "—"})`);
        setAlertedItems((prev) => new Set(prev).add(execItemId));
        toast({ title: "⚠️ Alerta gerado", description: `${savedItem.title} fora da faixa permitida`, variant: "destructive" });
      }

      // Auto-resolve when value comes back in range
      if (isCompliant === true && savedItem) {
        await acknowledgeAlertsForItem(executionId, savedItem.id);
        if (alertedItems.has(execItemId)) {
          setAlertedItems((prev) => {
            const next = new Set(prev);
            next.delete(execItemId);
            return next;
          });
        }
      }
    },
    [saveItemValue, createAlert, acknowledgeAlertsForItem, executionId, alertedItems]
  );

  const handleComplete = async () => {
    setCompleting(true);
    try {
      // Revalidate against server before completing to avoid stale local state
      const fresh = await loadExecution(executionId);
      setData(fresh);
      const pending = fresh.items.filter((i) => i.is_required && i.completed_at == null);
      if (pending.length > 0) {
        toast({
          title: "Itens obrigatórios pendentes",
          description: pending.slice(0, 3).map((p) => `• ${p.title}`).join("\n") + (pending.length > 3 ? `\n+${pending.length - 3}...` : ""),
          variant: "destructive",
        });
        return;
      }
      const score = await completeExecution(executionId);
      toast({ title: `Checklist concluído! Nota: ${score}/100` });
      onComplete();
    } catch (err: any) {
      console.error("[checklist] complete error:", err);
      toast({ title: "Erro ao concluir", description: err?.message, variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items: ChecklistItemData[] = data.items;
  const totalRequired = items.filter((i) => i.is_required).length;
  const completedRequired = items.filter((i) => i.is_required && i.completed_at != null).length;
  const allRequiredDone = completedRequired >= totalRequired;
  const totalDone = items.filter((i) => i.completed_at != null).length;
  const progress = items.length > 0 ? Math.round((totalDone / items.length) * 100) : 0;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate">{data.checklistName}</h2>
          <div className="flex items-center gap-2">
            <Progress value={progress} className="flex-1 h-2" />
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
        </div>
        {data.started_at && data.maxDuration > 0 && (
          <ExecutionTimer startedAt={data.started_at} maxMinutes={data.maxDuration} />
        )}
      </div>

      {/* Items */}
      <div className="space-y-3">
        {items.map((item) => (
          <ExecutionItemRenderer
            key={item.executionItemId}
            item={item}
            onSave={handleSave}
            userId={userId}
            executionId={executionId}
          />
        ))}
      </div>

      {/* Submit */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
        <div className="max-w-lg mx-auto">
          <Button
            className="w-full"
            size="lg"
            disabled={completing || data.status === "concluido"}
            onClick={handleComplete}
          >
            {completing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            {data.status === "concluido"
              ? "Já Concluído"
              : !allRequiredDone
              ? `Faltam ${totalRequired - completedRequired} obrigatórios`
              : "Concluir Checklist"}
          </Button>
        </div>
      </div>
    </div>
  );
}
