import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Clock, AlertTriangle, XCircle, Activity,
  Plus, UserPlus, ListChecks, Trophy, TrendingDown, AlertOctagon,
  QrCode, RefreshCw,
} from "lucide-react";
import { useChecklistDashboard } from "@/hooks/use-checklist-dashboard";
import { CompletionChart } from "./CompletionChart";
import { ShiftComparison } from "./ShiftComparison";
import { AlertsPanel } from "./AlertsPanel";
import { CompletedExecutionsDialog } from "./CompletedExecutionsDialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toLocalDateStr } from "@/lib/date";

interface DashboardPanelProps {
  onNavigate?: (section: string) => void;
  onQrOpen?: () => void;
  onSendReport?: () => void;
  onGenerateDaily?: () => void;
  sendingReport?: boolean;
  isGenerating?: boolean;
}

export function DashboardPanel({ onNavigate, onQrOpen, onGenerateDaily, isGenerating }: DashboardPanelProps) {
  const [date, setDate] = useState(toLocalDateStr());
  const autoDateRef = useRef(date);

  // Auto-rollover: se o usuário está visualizando "hoje" e o dia mudou (virada de meia-noite
  // ou aba ficou inativa), avança automaticamente para o novo dia.
  useEffect(() => {
    const check = () => {
      const today = toLocalDateStr();
      if (today !== autoDateRef.current) return; // não força se usuário já está em outro dia auto
      setDate((prev) => {
        if (prev !== autoDateRef.current) return prev; // usuário escolheu outra data manualmente
        const fresh = toLocalDateStr();
        autoDateRef.current = fresh;
        return fresh;
      });
    };
    const id = window.setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", check);
    };
  }, []);

  const handleDateChange = (value: string) => {
    autoDateRef.current = value; // marca esta escolha como "ativa" para o auto-rollover
    setDate(value);
  };
  const [completedDialogOpen, setCompletedDialogOpen] = useState(false);
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);
  const [notStartedDialogOpen, setNotStartedDialogOpen] = useState(false);
  const {
    metrics, completionChart, shiftComparison, alerts, unacknowledgedAlerts,
    acknowledgeAlert, criticalTasks, timeline, teamHighlights,
    healthPct, healthLevel, isLoading, metricsLoading, criticalLoading,
    timelineLoading, highlightsLoading,
  } = useChecklistDashboard({ date });

  const total = metrics?.total || 0;

  return (
    <div className="space-y-4">
      {/* Top bar: date + shortcuts */}
      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        {unacknowledgedAlerts.length > 0 && (
          <Badge variant="destructive">{unacknowledgedAlerts.length} alerta(s)</Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onQrOpen}>
            <QrCode className="h-4 w-4 mr-1" /> QR Code
          </Button>
          <Button variant="outline" size="sm" onClick={onGenerateDaily} disabled={isGenerating}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isGenerating ? "animate-spin" : ""}`} /> Gerar Tarefas
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate?.("checklists")}>
            <Plus className="h-4 w-4 mr-1" /> Novo Checklist
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate?.("equipe")}>
            <UserPlus className="h-4 w-4 mr-1" /> Colaborador
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate?.("hoje")}>
            <ListChecks className="h-4 w-4 mr-1" /> Tarefas de Hoje
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Concluídos" value={metrics?.concluido ?? 0} total={total} icon={CheckCircle2} color="text-green-600" loading={metricsLoading} onClick={() => setCompletedDialogOpen(true)} />
        <MetricCard title="Atrasados" value={metrics?.atrasado ?? 0} total={total} icon={AlertTriangle} color="text-orange-600" loading={metricsLoading} onClick={() => setOverdueDialogOpen(true)} />
        <MetricCard title="Não Iniciados" value={metrics?.naoIniciado ?? 0} total={total} icon={XCircle} color="text-muted-foreground" loading={metricsLoading} onClick={() => setNotStartedDialogOpen(true)} />
        <HealthCard pct={healthPct} level={healthLevel} loading={metricsLoading} />
      </div>

      {/* Score */}
      {metrics && total > 0 && (
        <Card>
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm font-medium">Score médio do dia</span>
            <Badge variant="secondary" className="text-lg">{metrics.avgScore}/100</Badge>
          </CardContent>
        </Card>
      )}

      {/* Charts + Shifts */}
      <div className="grid gap-4 md:grid-cols-2">
        <CompletionChart data={completionChart} />
        <ShiftComparison data={shiftComparison} />
      </div>

      {/* Critical tasks + Activity feed */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Critical tasks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-destructive" />
              Tarefas Críticas em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {criticalLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : criticalTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                ✅ Nenhuma tarefa crítica em aberto hoje
              </p>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {criticalTasks.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{t.checklistName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.sector} • {t.operator} • {t.scheduledTime}
                      </p>
                    </div>
                    {t.minutesLate > 0 && (
                      <Badge variant="destructive" className="text-[10px] shrink-0 ml-2">
                        {t.minutesLate >= 60 ? `${Math.floor(t.minutesLate / 60)}h${t.minutesLate % 60}m` : `${t.minutesLate}min`} atraso
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Atividades Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !metrics?.executions || metrics.executions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma atividade registrada hoje
              </p>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {metrics.executions.slice(0, 15).map((exec: any) => (
                  <div key={exec.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot status={exec.status} />
                      <div className="min-w-0">
                        <span className="truncate block text-sm">{exec.checklists?.name || "Checklist"}</span>
                        <span className="text-muted-foreground text-xs">{exec.checklist_operators?.name || "—"}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {exec.completed_at
                        ? format(new Date(exec.completed_at), "HH:mm")
                        : exec.started_at
                        ? format(new Date(exec.started_at), "HH:mm")
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Linha do Tempo do Dia</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum checklist agendado para hoje</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {timeline.map((item: any) => (
                <div
                  key={item.id}
                  className={cn(
                    "shrink-0 rounded-lg border p-3 min-w-[140px] text-center space-y-1",
                    item.status === "concluido" && "border-green-500/50 bg-green-500/5",
                    item.status === "em_andamento" && "border-blue-500/50 bg-blue-500/5",
                    item.status === "atrasado" && "border-orange-500/50 bg-orange-500/5",
                    (item.status === "pendente" || item.status === "nao_iniciado") && "border-border bg-muted/30",
                  )}
                >
                  <StatusDot status={item.status} />
                  <p className="text-xs font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">{item.operator}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.scheduledTime !== "99:99" ? item.scheduledTime : "—"}
                  </p>
                  {item.score != null && (
                    <Badge variant="secondary" className="text-[10px]">{item.score}/100</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Highlights */}
      <div className="grid gap-3 sm:grid-cols-3">
        <HighlightCard
          icon={Trophy}
          iconColor="text-yellow-600"
          title="Melhor da Semana"
          value={teamHighlights?.bestOperator?.name}
          subtitle={teamHighlights?.bestOperator ? `Score: ${teamHighlights.bestOperator.avgScore}` : undefined}
          loading={highlightsLoading}
          emptyText="Sem dados"
        />
        <HighlightCard
          icon={TrendingDown}
          iconColor="text-red-600"
          title="Precisa de Atenção"
          value={teamHighlights?.worstOperator?.name}
          subtitle={teamHighlights?.worstOperator ? `Score: ${teamHighlights.worstOperator.avgScore}` : undefined}
          loading={highlightsLoading}
          emptyText="Sem dados"
        />
        <HighlightCard
          icon={AlertTriangle}
          iconColor="text-orange-600"
          title="Checklist com Mais Falhas"
          value={teamHighlights?.worstChecklist?.name}
          subtitle={teamHighlights?.worstChecklist ? `${teamHighlights.worstChecklist.failRate}% de falha` : undefined}
          loading={highlightsLoading}
          emptyText="Sem dados"
        />
      </div>

      {/* Alerts */}
      <AlertsPanel alerts={alerts} onAcknowledge={(id) => acknowledgeAlert({ alertId: id })} />

      <CompletedExecutionsDialog
        open={completedDialogOpen}
        onOpenChange={setCompletedDialogOpen}
        date={date}
        status="concluido"
      />
      <CompletedExecutionsDialog
        open={overdueDialogOpen}
        onOpenChange={setOverdueDialogOpen}
        date={date}
        status="atrasado"
      />
      <CompletedExecutionsDialog
        open={notStartedDialogOpen}
        onOpenChange={setNotStartedDialogOpen}
        date={date}
        status="nao_iniciado"
      />
    </div>
  );
}

function MetricCard({ title, value, total, icon: Icon, color, loading, onClick }: any) {
  if (loading) return <Card><CardContent className="py-4"><Skeleton className="h-12 w-full" /></CardContent></Card>;
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer hover:bg-muted/40 transition-colors" : undefined}
    >
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-6 w-6 ${color}`} />
          <div className="flex-1">
            <p className="text-xl font-bold leading-none">{value}</p>
            <p className="text-[10px] text-muted-foreground">{title}</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </CardContent>
    </Card>
  );
}

function HealthCard({ pct, level, loading }: { pct: number | null; level: "green" | "yellow" | "red" | null; loading: boolean }) {
  if (loading) return <Card><CardContent className="py-4"><Skeleton className="h-12 w-full" /></CardContent></Card>;
  if (pct === null) return null;
  const config = {
    green: { bg: "bg-green-500", ring: "ring-green-200", label: "Excelente" },
    yellow: { bg: "bg-yellow-500", ring: "ring-yellow-200", label: "Atenção" },
    red: { bg: "bg-red-500", ring: "ring-red-200", label: "Crítico" },
  };
  const c = level ? config[level] : config.green;
  return (
    <Card className="col-span-2 lg:col-span-1">
      <CardContent className="py-3 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center ring-4 shrink-0", c.bg, c.ring)}>
          <Activity className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-xl font-bold leading-none">{pct}%</p>
          <p className="text-[10px] text-muted-foreground">Saúde — {c.label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function HighlightCard({ icon: Icon, iconColor, title, value, subtitle, loading, emptyText }: any) {
  return (
    <Card>
      <CardContent className="py-4 flex items-center gap-3">
        <Icon className={`h-6 w-6 shrink-0 ${iconColor}`} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="h-4 w-24 mt-1" />
          ) : value ? (
            <>
              <p className="text-sm font-semibold truncate">{value}</p>
              {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    concluido: "bg-green-500",
    em_andamento: "bg-blue-500",
    atrasado: "bg-orange-500",
    pendente: "bg-gray-400",
    nao_iniciado: "bg-gray-300",
  };
  return <div className={`w-2 h-2 rounded-full shrink-0 ${colors[status] || "bg-gray-400"}`} />;
}
