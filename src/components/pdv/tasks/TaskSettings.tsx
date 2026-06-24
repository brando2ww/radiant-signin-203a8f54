import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { useOperationalTasks, type ShiftConfig, type TaskSettings as TaskSettingsType } from "@/hooks/use-operational-tasks";
import { SettingsNavAnchors } from "./settings/SettingsNavAnchors";
import { ShiftsSection } from "./settings/ShiftsSection";
import { SectorsSection, type SectorConfig } from "./settings/SectorsSection";
import { AlertsSection } from "./settings/AlertsSection";
import { ReportsSection } from "./settings/ReportsSection";
import { ExecutionSection } from "./settings/ExecutionSection";
import { AccessSection } from "./settings/AccessSection";
import { DataSection } from "./settings/DataSection";

interface Props {
  onNavigate?: (section: string) => void;
}

function SectionWrapper({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={`section-${id}`} className="scroll-mt-20 space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function TaskSettings({ onNavigate }: Props) {
  const { settings, saveSettings } = useOperationalTasks();
  const [state, setState] = useState<Omit<TaskSettingsType, "id" | "userId">>(toState(settings));

  useEffect(() => {
    setState(toState(settings));
  }, [settings]);

  const patch = (partial: Partial<Omit<TaskSettingsType, "id" | "userId">>) => {
    setState((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = () => {
    saveSettings(state);
  };

  return (
    <div className="space-y-4 pb-20">
      <SettingsNavAnchors />

      <SectionWrapper id="turnos" title="Turnos" description="Configure os turnos de trabalho, horários, cores e dias ativos.">
        <ShiftsSection shifts={state.shifts} onChange={(shifts) => patch({ shifts })} />
      </SectionWrapper>

      <SectionWrapper id="setores" title="Setores" description="Gerencie os setores do seu estabelecimento. A cor e ícone são usados em todo o sistema.">
        <SectorsSection sectors={state.sectorsConfig as SectorConfig[]} onChange={(sectorsConfig) => patch({ sectorsConfig })} />
      </SectionWrapper>

      <SectionWrapper id="alertas" title="Alertas e Notificações" description="Configure quando e como receber alertas sobre tarefas e checklists.">
        <AlertsSection
          values={{
            alertCriticalEnabled: state.alertCriticalEnabled,
            alertCriticalDelayMinutes: state.alertCriticalDelayMinutes,
            alertOverdueEnabled: state.alertOverdueEnabled,
            alertOverdueDelayMinutes: state.alertOverdueDelayMinutes,
            alertDailySummaryEnabled: state.alertDailySummaryEnabled,
            alertDailySummaryTime: state.alertDailySummaryTime,
            alertDailySummaryTarget: state.alertDailySummaryTarget,
            alertTemperatureEnabled: state.alertTemperatureEnabled,
            alertBrowserNotifications: state.alertBrowserNotifications,
          }}
          onChange={(v) => patch(v as any)}
        />
      </SectionWrapper>

      <SectionWrapper id="relatorios" title="Relatórios Automáticos" description="Configure relatórios diários e semanais enviados automaticamente.">
        <ReportsSection
          values={{
            reportDailyContent: state.reportDailyContent,
            reportWeeklyEnabled: state.reportWeeklyEnabled,
            reportWeeklyDay: state.reportWeeklyDay,
            emailReportEnabled: state.emailReportEnabled,
            emailReportAddress: state.emailReportAddress,
            emailReportTime: state.emailReportTime,
            emailReportIncludeChecklists: state.emailReportIncludeChecklists,
            emailReportIncludeTasks: state.emailReportIncludeTasks,
          }}
          onChange={(v) => patch(v as any)}
        />
      </SectionWrapper>

      <SectionWrapper id="execucao" title="Execução e Comportamento" description="Defina o comportamento padrão da execução de checklists.">
        <ExecutionSection
          values={{
            autoGenerate: state.autoGenerate,
            allowLateCompletion: state.allowLateCompletion,
            requirePhotoDefault: state.requirePhotoDefault,
            defaultMaxDurationMinutes: state.defaultMaxDurationMinutes,
            allowFreeNotes: state.allowFreeNotes,
            showCountdownTimer: state.showCountdownTimer,
          }}
          onChange={(v) => patch(v as any)}
        />
      </SectionWrapper>

      <SectionWrapper id="acesso" title="Acesso e Segurança" description="Controle de acesso, PINs e sessões dos colaboradores.">
        <AccessSection
          values={{
            qrCodeEnabled: state.qrCodeEnabled,
            blockEarlyExecution: state.blockEarlyExecution,
            minPinDigits: state.minPinDigits,
            sessionTimeoutMinutes: state.sessionTimeoutMinutes,
          }}
          onChange={(v) => patch(v as any)}
          onNavigateToLogs={onNavigate ? () => onNavigate("logs") : undefined}
        />
      </SectionWrapper>

      <SectionWrapper id="dados" title="Dados e Backup" description="Exporte seus dados, histórico e gerencie o armazenamento.">
        <DataSection />
      </SectionWrapper>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border p-4 -mx-4 md:-mx-6 flex justify-end">
        <Button onClick={handleSave} size="lg">
          <Save className="h-4 w-4 mr-2" /> Salvar Configurações
        </Button>
      </div>
    </div>
  );
}

function toState(s: TaskSettingsType): Omit<TaskSettingsType, "id" | "userId"> {
  const { id, userId, ...rest } = s;
  return rest;
}
