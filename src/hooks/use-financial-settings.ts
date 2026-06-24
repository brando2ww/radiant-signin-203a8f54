import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface FinancialSettings {
  id: string;
  userId: string;
  defaultAccountingRegime: "cash" | "accrual";
  defaultPayableChartAccountId: string | null;
  defaultReceivableChartAccountId: string | null;
  defaultCostCenterId: string | null;
  defaultBankAccountId: string | null;
  overdueTolerationDays: number;
  alertDueDateEnabled: boolean;
  alertDueDateDaysBefore: number;
  alertDueDateEmail: string;
}

export interface BankAccountOption { id: string; name: string }
export interface ChartAccountOption { id: string; name: string; code: string; accountType: string }
export interface CostCenterOption { id: string; name: string }

const DEFAULT_SETTINGS = (userId: string): FinancialSettings => ({
  id: "",
  userId,
  defaultAccountingRegime: "cash",
  defaultPayableChartAccountId: null,
  defaultReceivableChartAccountId: null,
  defaultCostCenterId: null,
  defaultBankAccountId: null,
  overdueTolerationDays: 0,
  alertDueDateEnabled: false,
  alertDueDateDaysBefore: 3,
  alertDueDateEmail: "",
});

export function useFinancialSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["financial-settings", user?.id],
    queryFn: async (): Promise<FinancialSettings> => {
      const { data, error } = await supabase
        .from("pdv_financial_settings" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS(user!.id);
      const d = data as any;
      return {
        id: d.id,
        userId: d.user_id,
        defaultAccountingRegime: d.default_accounting_regime ?? "cash",
        defaultPayableChartAccountId: d.default_payable_chart_account_id ?? null,
        defaultReceivableChartAccountId: d.default_receivable_chart_account_id ?? null,
        defaultCostCenterId: d.default_cost_center_id ?? null,
        defaultBankAccountId: d.default_bank_account_id ?? null,
        overdueTolerationDays: d.overdue_tolerance_days ?? 0,
        alertDueDateEnabled: d.alert_due_date_enabled ?? false,
        alertDueDateDaysBefore: d.alert_due_date_days_before ?? 3,
        alertDueDateEmail: d.alert_due_date_email ?? "",
      };
    },
    enabled: !!user?.id,
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts-list", user?.id],
    queryFn: async (): Promise<BankAccountOption[]> => {
      const { data, error } = await supabase
        .from("pdv_bank_accounts")
        .select("id, name")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []).map((r) => ({ id: r.id, name: r.name }));
    },
    enabled: !!user?.id,
  });

  const { data: chartAccounts = [] } = useQuery({
    queryKey: ["chart-accounts-list", user?.id],
    queryFn: async (): Promise<ChartAccountOption[]> => {
      const { data, error } = await supabase
        .from("pdv_chart_of_accounts")
        .select("id, name, code, account_type")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        accountType: r.account_type,
      }));
    },
    enabled: !!user?.id,
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ["cost-centers-list", user?.id],
    queryFn: async (): Promise<CostCenterOption[]> => {
      const { data, error } = await supabase
        .from("pdv_cost_centers")
        .select("id, name")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []).map((r) => ({ id: r.id, name: r.name }));
    },
    enabled: !!user?.id,
  });

  const saveSettings = useMutation({
    mutationFn: async (s: Omit<FinancialSettings, "id" | "userId">) => {
      const { error } = await (supabase.from("pdv_financial_settings" as any) as any).upsert(
        {
          user_id: user!.id,
          default_accounting_regime: s.defaultAccountingRegime,
          default_payable_chart_account_id: s.defaultPayableChartAccountId || null,
          default_receivable_chart_account_id: s.defaultReceivableChartAccountId || null,
          default_cost_center_id: s.defaultCostCenterId || null,
          default_bank_account_id: s.defaultBankAccountId || null,
          overdue_tolerance_days: s.overdueTolerationDays,
          alert_due_date_enabled: s.alertDueDateEnabled,
          alert_due_date_days_before: s.alertDueDateDaysBefore,
          alert_due_date_email: s.alertDueDateEmail || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-settings"] });
      toast({ title: "Configurações financeiras salvas" });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  return {
    settings: settings ?? DEFAULT_SETTINGS(user?.id ?? ""),
    bankAccounts,
    chartAccounts,
    costCenters,
    isLoading,
    saveSettings: saveSettings.mutate,
    isSaving: saveSettings.isPending,
  };
}
