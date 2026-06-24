import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Download, FileText, Mail, Send } from "lucide-react";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const REPORT_CONTENT_OPTIONS = [
  { key: "taxa_conclusao", label: "Taxa de conclusão do dia" },
  { key: "atrasadas", label: "Tarefas atrasadas" },
  { key: "destaque", label: "Colaborador destaque" },
  { key: "criticos", label: "Itens críticos em aberto" },
  { key: "turnos", label: "Comparativo de turnos" },
];

const WEEK_DAYS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terça" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sábado" },
];

interface ReportSettings {
  reportDailyContent: string[];
  reportWeeklyEnabled: boolean;
  reportWeeklyDay: number;
  emailReportEnabled: boolean;
  emailReportAddress: string;
  emailReportTime: string;
  emailReportIncludeChecklists: boolean;
  emailReportIncludeTasks: boolean;
}

interface Props {
  values: ReportSettings;
  onChange: (values: Partial<ReportSettings>) => void;
}

export function ReportsSection({ values, onChange }: Props) {
  const { user } = useAuth();
  const [exportRange, setExportRange] = useState<DateRange | undefined>();
  const [sendingTest, setSendingTest] = useState(false);

  const handleTestEmail = async () => {
    if (!user?.id || !values.emailReportAddress) return;
    setSendingTest(true);
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const reportDate = yesterday.toISOString().split("T")[0];
      const { error } = await supabase.functions.invoke("send-checklist-report", {
        body: { user_id: user.id, report_date: reportDate, test_email: values.emailReportAddress },
      });
      if (error) throw error;
      toast({ title: "Relatório de teste enviado!", description: `Verifique ${values.emailReportAddress}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao enviar";
      toast({ title: "Erro no envio", description: msg, variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  const toggleContent = (key: string) => {
    const current = values.reportDailyContent || [];
    const updated = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
    onChange({ reportDailyContent: updated });
  };

  return (
    <div className="space-y-5">
      {/* Daily email report */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> Relatório diário por e-mail
            </Label>
            <p className="text-xs text-muted-foreground">
              Enviado na manhã seguinte com o resumo do dia anterior
            </p>
          </div>
          <Switch
            checked={values.emailReportEnabled}
            onCheckedChange={(v) => onChange({ emailReportEnabled: v })}
          />
        </div>

        {values.emailReportEnabled && (
          <div className="space-y-3 pl-4 border-l-2 border-muted">
            <div>
              <Label className="text-xs">E-mail destinatário</Label>
              <Input
                type="email"
                placeholder="gestor@seurestaurante.com"
                value={values.emailReportAddress}
                onChange={(e) => onChange({ emailReportAddress: e.target.value })}
                className="mt-1 h-8"
              />
            </div>
            <div className="w-32">
              <Label className="text-xs">Horário de envio</Label>
              <Input
                type="time"
                className="mt-1 h-8"
                value={values.emailReportTime}
                onChange={(e) => onChange({ emailReportTime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Incluir no relatório</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={values.emailReportIncludeChecklists}
                  onCheckedChange={(v) => onChange({ emailReportIncludeChecklists: !!v })}
                />
                <Label className="text-sm font-normal cursor-pointer">Checklists</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={values.emailReportIncludeTasks}
                  onCheckedChange={(v) => onChange({ emailReportIncludeTasks: !!v })}
                />
                <Label className="text-sm font-normal cursor-pointer">Tarefas operacionais</Label>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestEmail}
              disabled={sendingTest || !values.emailReportAddress}
            >
              <Send className="h-4 w-4 mr-1" />
              {sendingTest ? "Enviando..." : "Enviar relatório de teste"}
            </Button>
          </div>
        )}
      </div>

      {/* Report content */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Conteúdo do relatório</Label>
        <p className="text-xs text-muted-foreground">Escolha o que incluir nos relatórios automáticos</p>
        <div className="space-y-2 mt-2">
          {REPORT_CONTENT_OPTIONS.map((opt) => (
            <div key={opt.key} className="flex items-center gap-2">
              <Checkbox
                checked={(values.reportDailyContent || []).includes(opt.key)}
                onCheckedChange={() => toggleContent(opt.key)}
              />
              <Label className="text-sm font-normal cursor-pointer">{opt.label}</Label>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly report */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label>Relatório semanal</Label>
            <p className="text-xs text-muted-foreground">Resumo consolidado enviado uma vez por semana</p>
          </div>
          <Switch checked={values.reportWeeklyEnabled} onCheckedChange={(v) => onChange({ reportWeeklyEnabled: v })} />
        </div>
        {values.reportWeeklyEnabled && (
          <div className="w-48 pl-4 border-l-2 border-muted">
            <Label className="text-xs">Dia do envio</Label>
            <Select value={String(values.reportWeeklyDay)} onValueChange={(v) => onChange({ reportWeeklyDay: +v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEK_DAYS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Manual export */}
      <div className="space-y-3 pt-3 border-t border-border">
        <Label className="text-sm font-semibold">Exportação manual</Label>
        <p className="text-xs text-muted-foreground">Gere um relatório do período selecionado</p>
        <DatePickerWithRange date={exportRange} setDate={setExportRange} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!exportRange?.from || !exportRange?.to}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!exportRange?.from || !exportRange?.to}>
            <FileText className="h-4 w-4 mr-1" /> Exportar PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
