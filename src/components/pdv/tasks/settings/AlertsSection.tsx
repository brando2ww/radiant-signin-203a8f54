import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface AlertSettings {
  alertCriticalEnabled: boolean;
  alertCriticalDelayMinutes: number;
  alertOverdueEnabled: boolean;
  alertOverdueDelayMinutes: number;
  alertDailySummaryEnabled: boolean;
  alertDailySummaryTime: string;
  alertDailySummaryTarget: string;
  alertTemperatureEnabled: boolean;
  alertBrowserNotifications: boolean;
}

interface Props {
  values: AlertSettings;
  onChange: (values: Partial<AlertSettings>) => void;
}

export function AlertsSection({ values, onChange }: Props) {
  return (
    <div className="space-y-5">
      {/* Critical items */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label>Itens críticos não concluídos</Label>
          <p className="text-xs text-muted-foreground">Alerta quando itens críticos passam do prazo</p>
        </div>
        <div className="flex items-center gap-3">
          {values.alertCriticalEnabled && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                className="w-16 h-8 text-sm"
                value={values.alertCriticalDelayMinutes}
                onChange={(e) => onChange({ alertCriticalDelayMinutes: +e.target.value })}
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          )}
          <Switch checked={values.alertCriticalEnabled} onCheckedChange={(v) => onChange({ alertCriticalEnabled: v })} />
        </div>
      </div>

      {/* Overdue checklist */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label>Checklist inteiro atrasado</Label>
          <p className="text-xs text-muted-foreground">Alerta quando um checklist inteiro passa do prazo</p>
        </div>
        <div className="flex items-center gap-3">
          {values.alertOverdueEnabled && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                className="w-16 h-8 text-sm"
                value={values.alertOverdueDelayMinutes}
                onChange={(e) => onChange({ alertOverdueDelayMinutes: +e.target.value })}
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          )}
          <Switch checked={values.alertOverdueEnabled} onCheckedChange={(v) => onChange({ alertOverdueEnabled: v })} />
        </div>
      </div>

      {/* Daily summary */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label>Resumo diário automático</Label>
            <p className="text-xs text-muted-foreground">Resumo das tarefas do dia enviado automaticamente</p>
          </div>
          <Switch checked={values.alertDailySummaryEnabled} onCheckedChange={(v) => onChange({ alertDailySummaryEnabled: v })} />
        </div>
        {values.alertDailySummaryEnabled && (
          <div className="flex gap-3 pl-4 border-l-2 border-muted">
            <div className="w-32">
              <Label className="text-xs">Horário</Label>
              <Input type="time" className="h-8" value={values.alertDailySummaryTime} onChange={(e) => onChange({ alertDailySummaryTime: e.target.value })} />
            </div>
            <div className="w-40">
              <Label className="text-xs">Enviar para</Label>
              <Select value={values.alertDailySummaryTarget} onValueChange={(v) => onChange({ alertDailySummaryTarget: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="lideres">Líderes</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Temperature alert */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label>Alerta de temperatura fora da faixa</Label>
          <p className="text-xs text-muted-foreground">Notifica quando valores de temperatura estão fora da faixa configurada</p>
        </div>
        <Switch checked={values.alertTemperatureEnabled} onCheckedChange={(v) => onChange({ alertTemperatureEnabled: v })} />
      </div>

      {/* Channels */}
      <div className="space-y-3 pt-3 border-t border-border">
        <Label className="text-sm font-semibold">Canais de alerta</Label>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label className="text-sm">Notificação no navegador</Label>
            <p className="text-xs text-muted-foreground">Push notification no navegador</p>
          </div>
          <Switch checked={values.alertBrowserNotifications} onCheckedChange={(v) => onChange({ alertBrowserNotifications: v })} />
        </div>
      </div>
    </div>
  );
}
