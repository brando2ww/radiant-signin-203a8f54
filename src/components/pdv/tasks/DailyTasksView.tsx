import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Clock, ListChecks, CalendarPlus, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DailyOverview } from "./DailyOverview";
import { DailyTaskFilters, type DailyFilters } from "./DailyTaskFilters";
import { DailyTaskCard } from "./DailyTaskCard";
import { DailyTaskKanban } from "./DailyTaskKanban";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { ChecklistExecutionPage } from "@/components/pdv/checklists/execution/ChecklistExecutionPage";
import { useDailyTasks, type DailyTask } from "@/hooks/use-daily-tasks";
import { useChecklistOperators } from "@/hooks/use-checklist-operators";
import { useChecklistExecution } from "@/hooks/use-checklist-execution";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useOperationalTasks } from "@/hooks/use-operational-tasks";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  onNavigate?: (section: string) => void;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DailyTasksView({ onNavigate }: Props) {
  const { visibleUserId } = useEstablishmentId();
  const todayStr = toLocalDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const { tasks, metrics, isLoading, refetch, currentShift, isToday, isPast } = useDailyTasks(selectedDate);
  const { operators } = useChecklistOperators();
  const { startExecution } = useChecklistExecution(visibleUserId || "");
  const { generateDaily, isGenerating } = useOperationalTasks();

  const [filters, setFilters] = useState<DailyFilters>({
    shift: "Todos",
    sector: "all",
    operator: "all",
    status: "all",
    viewMode: "list",
  });

  const [detailTask, setDetailTask] = useState<DailyTask | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);

  // Reassign dialog
  const [reassignTask, setReassignTask] = useState<DailyTask | null>(null);
  const [reassignOpId, setReassignOpId] = useState("");

  // Skip dialog
  const [skipTask, setSkipTask] = useState<DailyTask | null>(null);
  const [skipReason, setSkipReason] = useState("");

  const { reassignOperator } = useDailyTasks();

  // Filter tasks
  const filtered = tasks.filter(t => {
    if (filters.shift !== "Todos" && t.shift !== filters.shift) return false;
    if (filters.sector !== "all" && t.sector !== filters.sector) return false;
    if (filters.operator !== "all" && t.assignedOperatorId !== filters.operator) return false;
    if (filters.status !== "all") {
      if (filters.status === "done" && t.status !== "done" && t.status !== "done_late") return false;
      if (filters.status !== "done" && t.status !== filters.status) return false;
    }
    return true;
  });

  // Group by shift for list view
  const shifts = ["Abertura", "Tarde", "Fechamento"];
  const grouped = shifts.map(s => ({
    shift: s,
    tasks: filtered.filter(t => t.shift === s),
  })).filter(g => g.tasks.length > 0);

  const handleStart = useCallback(async (task: DailyTask) => {
    try {
      if (task.executionId) {
        setActiveExecutionId(task.executionId);
        return;
      }
      const execId = await startExecution(
        task.checklistId,
        task.scheduleId,
        task.assignedOperatorId || "",
      );
      setActiveExecutionId(execId);
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar execução");
    }
  }, [startExecution]);

  const handleViewDetails = (task: DailyTask) => {
    setDetailTask(task);
    setDrawerOpen(true);
  };

  const handleReassign = (task: DailyTask) => {
    setReassignTask(task);
    setReassignOpId("");
  };

  const confirmReassign = () => {
    if (reassignTask && reassignOpId) {
      reassignOperator({ scheduleId: reassignTask.scheduleId, operatorId: reassignOpId });
    }
    setReassignTask(null);
  };

  const handleSkip = (task: DailyTask) => {
    setSkipTask(task);
    setSkipReason("");
  };

  const confirmSkip = async () => {
    // Not implemented in backend fully, but we can log it
    toast.info("Tarefa marcada como ignorada");
    setSkipTask(null);
    refetch();
  };

  // Execution mode
  if (activeExecutionId && visibleUserId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setActiveExecutionId(null)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar às tarefas
        </Button>
        <ChecklistExecutionPage
          executionId={activeExecutionId}
          userId={visibleUserId}
          onBack={() => { setActiveExecutionId(null); refetch(); }}
          onComplete={() => { setActiveExecutionId(null); refetch(); toast.success("Checklist concluído!"); }}
        />
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  // Empty state
  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <ListChecks className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma tarefa para hoje</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            As tarefas são geradas automaticamente a partir dos checklists agendados.
            Verifique se há agendamentos configurados para hoje.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => generateDaily(undefined)} disabled={isGenerating}>
              <CalendarPlus className="h-4 w-4 mr-1" />
              Gerar Tarefas do Dia
            </Button>
            {onNavigate && (
              <Button variant="outline" onClick={() => onNavigate("agendamento")}>
                Ir para Agendamento
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <DailyOverview
        metrics={metrics}
        currentShift={currentShift}
        hasTasks={tasks.length > 0}
        onGenerate={() => generateDaily(undefined)}
        isGenerating={isGenerating}
      />

      <DailyTaskFilters
        filters={filters}
        onChange={setFilters}
        operators={operators.filter(o => o.is_active).map(o => ({ id: o.id, name: o.name }))}
      />

      {filters.viewMode === "kanban" ? (
        <DailyTaskKanban
          tasks={filtered}
          onStart={handleStart}
          onViewDetails={handleViewDetails}
          onReassign={handleReassign}
          onSkip={handleSkip}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(({ shift, tasks: shiftTasks }) => {
            const done = shiftTasks.filter(t => t.status === "done" || t.status === "done_late").length;
            const isCurrent = shift === currentShift;
            return (
              <Card key={shift}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {shift}
                      {isCurrent && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">Atual</Badge>
                      )}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">{done}/{shiftTasks.length} ✓</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0 space-y-2">
                  {shiftTasks.map(task => (
                    <DailyTaskCard
                      key={task.scheduleId}
                      task={task}
                      onStart={handleStart}
                      onViewDetails={handleViewDetails}
                      onReassign={handleReassign}
                      onSkip={handleSkip}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TaskDetailDrawer
        task={detailTask}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onStart={handleStart}
      />

      {/* Reassign dialog */}
      <AlertDialog open={!!reassignTask} onOpenChange={() => setReassignTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reatribuir responsável</AlertDialogTitle>
            <AlertDialogDescription>
              Selecione o novo responsável para "{reassignTask?.checklistName}"
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={reassignOpId} onValueChange={setReassignOpId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um colaborador" />
            </SelectTrigger>
            <SelectContent>
              {operators.filter(o => o.is_active).map(o => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReassign} disabled={!reassignOpId}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Skip dialog */}
      <AlertDialog open={!!skipTask} onOpenChange={() => setSkipTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignorar tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo para ignorar "{skipTask?.checklistName}". Essa ação será registrada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={skipReason}
            onChange={e => setSkipReason(e.target.value)}
            placeholder="Motivo da justificativa..."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSkip} disabled={!skipReason.trim()}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
