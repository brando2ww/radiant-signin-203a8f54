import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface PurchaseSettings {
  id: string;
  userId: string;
  quotationPrefix: string;
  quotationDigits: number;
  orderPrefix: string;
  orderDigits: number;
  minSuppliers: number;
  defaultDeadlineDays: number;
  defaultMessageTemplate: string;
  requireManagerApproval: boolean;
  whatsappEnabled: boolean;
  whatsappSendMode: "whatsapp_only" | "whatsapp_email" | "manual";
  whatsappTestPhone: string;
}

const DEFAULT_SETTINGS = (userId: string): PurchaseSettings => ({
  id: "",
  userId,
  quotationPrefix: "COT",
  quotationDigits: 4,
  orderPrefix: "PC",
  orderDigits: 4,
  minSuppliers: 1,
  defaultDeadlineDays: 3,
  defaultMessageTemplate: "",
  requireManagerApproval: false,
  whatsappEnabled: false,
  whatsappSendMode: "whatsapp_only",
  whatsappTestPhone: "",
});

export function usePurchaseSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["purchase-settings", user?.id],
    queryFn: async (): Promise<PurchaseSettings> => {
      const { data, error } = await supabase
        .from("pdv_purchase_settings" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS(user!.id);
      const d = data as any;
      return {
        id: d.id,
        userId: d.user_id,
        quotationPrefix: d.quotation_prefix ?? "COT",
        quotationDigits: d.quotation_digits ?? 4,
        orderPrefix: d.order_prefix ?? "PC",
        orderDigits: d.order_digits ?? 4,
        minSuppliers: d.min_suppliers ?? 1,
        defaultDeadlineDays: d.default_deadline_days ?? 3,
        defaultMessageTemplate: d.default_message_template ?? "",
        requireManagerApproval: d.require_manager_approval ?? false,
        whatsappEnabled: d.whatsapp_enabled ?? false,
        whatsappSendMode: (d.whatsapp_send_mode ?? "whatsapp_only") as "whatsapp_only" | "whatsapp_email" | "manual",
        whatsappTestPhone: d.whatsapp_test_phone ?? "",
      };
    },
    enabled: !!user?.id,
  });

  const saveSettings = useMutation({
    mutationFn: async (s: Omit<PurchaseSettings, "id" | "userId">) => {
      const { error } = await (supabase.from("pdv_purchase_settings" as any) as any).upsert(
        {
          user_id: user!.id,
          quotation_prefix: s.quotationPrefix,
          quotation_digits: s.quotationDigits,
          order_prefix: s.orderPrefix,
          order_digits: s.orderDigits,
          min_suppliers: s.minSuppliers,
          default_deadline_days: s.defaultDeadlineDays,
          default_message_template: s.defaultMessageTemplate || null,
          require_manager_approval: s.requireManagerApproval,
          whatsapp_enabled: s.whatsappEnabled,
          whatsapp_send_mode: s.whatsappSendMode,
          whatsapp_test_phone: s.whatsappTestPhone || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-settings"] });
      toast({ title: "Configurações de compras salvas" });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  return {
    settings: settings ?? DEFAULT_SETTINGS(user?.id ?? ""),
    isLoading,
    saveSettings: saveSettings.mutate,
    isSaving: saveSettings.isPending,
  };
}
