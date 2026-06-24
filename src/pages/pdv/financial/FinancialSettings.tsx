import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, Scale, Landmark, AlertCircle } from "lucide-react";
import { useFinancialSettings, type FinancialSettings as FinancialSettingsType } from "@/hooks/use-financial-settings";

function SectionWrapper({ id, title, description, icon: Icon, children }: {
  id: string; title: string; description: string;
  icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <section id={`section-${id}`} className="scroll-mt-20 space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const NONE_VALUE = "__none__";

export function FinancialSettingsContent() {
  const { settings, bankAccounts, chartAccounts, costCenters, isLoading, saveSettings, isSaving } =
    useFinancialSettings();
  const [state, setState] = useState<Omit<FinancialSettingsType, "id" | "userId">>(toState(settings));

  useEffect(() => {
    setState(toState(settings));
  }, [settings]);

  const patch = (partial: Partial<Omit<FinancialSettingsType, "id" | "userId">>) => {
    setState((prev) => ({ ...prev, ...partial }));
  };

  const payableAccounts = chartAccounts.filter((a) => a.accountType === "expense" || a.accountType === "liability");
  const receivableAccounts = chartAccounts.filter((a) => a.accountType === "revenue" || a.accountType === "asset");

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 pb-24 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações Financeiras</h1>
        <p className="text-sm text-muted-foreground">Defina comportamentos padrão para lançamentos e relatórios.</p>
      </div>

      {/* Regime contábil */}
      <SectionWrapper id="regime" title="Regime Contábil" description="Define como as datas são usadas para competência dos lançamentos." icon={Scale}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => patch({ defaultAccountingRegime: "cash" })}
              className={`rounded-lg border p-4 text-left transition-colors ${
                state.defaultAccountingRegime === "cash"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted"
              }`}
            >
              <p className="font-medium text-sm">Regime de Caixa</p>
              <p className="text-xs text-muted-foreground mt-1">
                Reconhece receitas e despesas na data do pagamento efetivo.
              </p>
            </button>
            <button
              type="button"
              onClick={() => patch({ defaultAccountingRegime: "accrual" })}
              className={`rounded-lg border p-4 text-left transition-colors ${
                state.defaultAccountingRegime === "accrual"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted"
              }`}
            >
              <p className="font-medium text-sm">Regime de Competência</p>
              <p className="text-xs text-muted-foreground mt-1">
                Reconhece na data de emissão do documento, independente do pagamento.
              </p>
            </button>
          </div>
        </div>
      </SectionWrapper>

      {/* Padrões para novos lançamentos */}
      <SectionWrapper id="padroes" title="Padrões para Novos Lançamentos" description="Valores pré-selecionados ao criar uma nova transação." icon={Landmark}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Conta bancária padrão</Label>
            <Select
              value={state.defaultBankAccountId ?? NONE_VALUE}
              onValueChange={(v) => patch({ defaultBankAccountId: v === NONE_VALUE ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma conta..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Nenhuma</SelectItem>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bankAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground">Cadastre contas bancárias em Financeiro → configurações de conta.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Plano de contas padrão — Contas a Pagar</Label>
              <Select
                value={state.defaultPayableChartAccountId ?? NONE_VALUE}
                onValueChange={(v) => patch({ defaultPayableChartAccountId: v === NONE_VALUE ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Nenhuma</SelectItem>
                  {(payableAccounts.length > 0 ? payableAccounts : chartAccounts).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Plano de contas padrão — Contas a Receber</Label>
              <Select
                value={state.defaultReceivableChartAccountId ?? NONE_VALUE}
                onValueChange={(v) => patch({ defaultReceivableChartAccountId: v === NONE_VALUE ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Nenhuma</SelectItem>
                  {(receivableAccounts.length > 0 ? receivableAccounts : chartAccounts).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Centro de custo padrão</Label>
            <Select
              value={state.defaultCostCenterId ?? NONE_VALUE}
              onValueChange={(v) => patch({ defaultCostCenterId: v === NONE_VALUE ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
                {costCenters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-border">
            <div className="space-y-1">
              <Label>Tolerância de vencimento</Label>
              <p className="text-xs text-muted-foreground">
                Dias de carência antes de marcar um lançamento como "Atrasado"
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={30}
                value={state.overdueTolerationDays}
                onChange={(e) => patch({ overdueTolerationDays: Math.max(0, +e.target.value) })}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">dias</span>
            </div>
          </div>
        </div>
      </SectionWrapper>

      {/* Alertas */}
      <SectionWrapper id="alertas" title="Alertas de Vencimento" description="Notificações automáticas sobre lançamentos próximos do vencimento." icon={AlertCircle}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label>Alertas de vencimento por e-mail</Label>
              <p className="text-xs text-muted-foreground">
                Receba um resumo de lançamentos a vencer nos próximos dias
              </p>
            </div>
            <Switch
              checked={state.alertDueDateEnabled}
              onCheckedChange={(v) => patch({ alertDueDateEnabled: v })}
            />
          </div>
          {state.alertDueDateEnabled && (
            <div className="space-y-3 pl-4 border-l-2 border-muted">
              <div className="flex gap-3 items-end">
                <div className="w-32">
                  <Label className="text-xs">Dias antes do vencimento</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={state.alertDueDateDaysBefore}
                    onChange={(e) => patch({ alertDueDateDaysBefore: Math.max(1, +e.target.value) })}
                    className="mt-1 h-8"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">E-mail de destino</Label>
                  <Input
                    type="email"
                    placeholder="financeiro@seurestaurante.com"
                    value={state.alertDueDateEmail}
                    onChange={(e) => patch({ alertDueDateEmail: e.target.value })}
                    className="mt-1 h-8"
                  />
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2 border border-amber-200">
                O envio automático por e-mail requer configuração de cron job. Entre em contato com o suporte para ativar.
              </p>
            </div>
          )}
        </div>
      </SectionWrapper>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border p-4 -mx-4 md:-mx-6 flex justify-end">
        <Button onClick={() => saveSettings(state)} disabled={isSaving} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}

export default FinancialSettingsContent;

function toState(s: FinancialSettingsType): Omit<FinancialSettingsType, "id" | "userId"> {
  const { id, userId, ...rest } = s;
  return rest;
}
