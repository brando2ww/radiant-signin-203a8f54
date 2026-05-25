import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  QrCode, RefreshCw, Send, LayoutDashboard, ClipboardCheck,
  Calendar, Users, BarChart3, Settings, Trophy, Camera,
  ShieldAlert, FileText,
} from "lucide-react";
import { ResponsivePageHeader } from "@/components/ui/responsive-page-header";
import { ChecklistsManager } from "@/components/pdv/checklists/ChecklistsManager";
import { SchedulesManager } from "@/components/pdv/checklists/SchedulesManager";
import { OperatorsManager } from "@/components/pdv/checklists/OperatorsManager";
import { OperationalReport } from "@/components/pdv/tasks/OperationalReport";
import { TaskSettings } from "@/components/pdv/tasks/TaskSettings";
import { TaskQRCodeDialog } from "@/components/pdv/tasks/TaskQRCodeDialog";
import { DashboardPanel } from "@/components/pdv/checklists/DashboardPanel";
import { TeamScorePanel } from "@/components/pdv/checklists/TeamScorePanel";
import { EvidenceGallery } from "@/components/pdv/checklists/EvidenceGallery";
import { ExpiryTrackingPanel } from "@/components/pdv/checklists/ExpiryTrackingPanel";
import { AccessLogsPanel } from "@/components/pdv/checklists/AccessLogsPanel";
import { AttentionPanel } from "@/components/pdv/checklists/AttentionPanel";
import { useOperationalTasks } from "@/hooks/use-operational-tasks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { key: "painel", label: "Painel", icon: LayoutDashboard },
  { key: "checklists", label: "Checklists", icon: ClipboardCheck },
  { key: "agendamento", label: "Agendamento", icon: Calendar },
  { key: "equipe", label: "Equipe", icon: Users },
  { key: "hoje", label: "Relatório Geral", icon: BarChart3 },
  { key: "configuracoes", label: "Configurações", icon: Settings },
  { key: "score", label: "Score", icon: Trophy },
  { key: "evidencias", label: "Evidências", icon: Camera },
  { key: "atencao", label: "Atenção", icon: ShieldAlert },
  { key: "validade", label: "Validade", icon: ShieldAlert },
  { key: "logs", label: "Logs", icon: FileText },
] as const;

export default function Tasks() {
  const [activeSection, setActiveSection] = useState<string>("painel");
  const [qrOpen, setQrOpen] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const { user } = useAuth();
  const {
    instances,
    settings,
    generateDaily: generateDailyFn,
    isGenerating,
    loadingInstances,
  } = useOperationalTasks();

  const handleSendReport = async () => {
    if (!user?.id) return;
    setSendingReport(true);
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tempo esgotado (20s). Tente novamente.")), 20000)
      );
      const result = await Promise.race([
        supabase.functions.invoke("send-tasks-report", { body: { user_id: user.id } }),
        timeoutPromise,
      ]) as { data: any; error: any };
      if (result.error) throw result.error;
      if (result.data?.error) throw new Error(result.data.error);
      toast({ title: "Relatório enviado! ✅", description: "O resumo das tarefas foi enviado via WhatsApp." });
    } catch (err: any) {
      toast({ title: "Erro ao enviar relatório", description: err.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setSendingReport(false);
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case "painel": return <DashboardPanel onNavigate={setActiveSection} onQrOpen={() => setQrOpen(true)} onSendReport={handleSendReport} onGenerateDaily={() => generateDailyFn(undefined)} sendingReport={sendingReport} isGenerating={isGenerating} />;
      case "checklists": return <ChecklistsManager />;
      case "agendamento": return <SchedulesManager />;
      case "equipe": return <OperatorsManager />;
      case "hoje": return <OperationalReport onNavigate={setActiveSection} />;
      case "configuracoes": return <TaskSettings onNavigate={setActiveSection} />;
      case "score": return <TeamScorePanel onNavigate={setActiveSection} />;
      case "evidencias": return <EvidenceGallery />;
      case "atencao": return <AttentionPanel />;
      case "validade": return <ExpiryTrackingPanel />;
      case "logs": return <AccessLogsPanel />;
      default: return <DashboardPanel />;
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-52 shrink-0 border-r border-border bg-card p-3 gap-1 h-full overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className={cn(
                "flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors text-left",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-card-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Content area */}
      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        {/* Mobile nav */}
        <nav className="flex md:hidden gap-2 overflow-x-auto p-3 scrollbar-hide border-b border-border bg-card">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-card-foreground border-border hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 md:p-6 space-y-4 min-w-0">
          <ResponsivePageHeader
            title="Checklists Operacionais"
            description="Gestão completa de checklists, equipe e agendamentos"
          />
          {renderContent()}
        </div>
      </div>

      <TaskQRCodeDialog open={qrOpen} onOpenChange={setQrOpen} />
    </div>
  );
}
