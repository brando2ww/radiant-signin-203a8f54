import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

export interface ConsumptionEntry {
  id: string;
  user_id: string;
  employee_id: string;
  operator_id: string | null;
  total: number;
  paid_amount: number;
  status: "pendente" | "pago_parcial" | "pago";
  items: any[];
  over_limit_justification: string | null;
  created_at: string;
}

export interface ConsumptionPayment {
  id: string;
  user_id: string;
  employee_id: string;
  amount: number;
  cashier_session_id: string | null;
  operator_id: string | null;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

export interface ConsumptionItemInput {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export function useEmployeeConsumption(employeeId?: string) {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const { data: entries = [] } = useQuery({
    queryKey: ["pdv-emp-consumption-entries", visibleUserId, employeeId || "all"],
    queryFn: async () => {
      if (!visibleUserId) return [];
      let q = supabase
        .from("pdv_employee_consumption_entries")
        .select("*")
        .eq("user_id", visibleUserId)
        .order("created_at", { ascending: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ConsumptionEntry[];
    },
    enabled: !!visibleUserId,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["pdv-emp-consumption-payments", visibleUserId, employeeId || "all"],
    queryFn: async () => {
      if (!visibleUserId) return [];
      let q = supabase
        .from("pdv_employee_consumption_payments")
        .select("*")
        .eq("user_id", visibleUserId)
        .order("created_at", { ascending: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ConsumptionPayment[];
    },
    enabled: !!visibleUserId,
  });

  const registerConsumption = useMutation({
    mutationFn: async (params: {
      employee_id: string;
      items: ConsumptionItemInput[];
      justification?: string;
    }) => {
      const { data, error } = await supabase.rpc(
        "pdv_register_employee_consumption" as any,
        {
          p_employee_id: params.employee_id,
          p_items: params.items as any,
          p_justification: params.justification || null,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv-emp-consumption-entries"] });
      qc.invalidateQueries({ queryKey: ["pdv-authorized-employees"] });
      toast.success("Consumo registrado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const settleConsumption = useMutation({
    mutationFn: async (params: {
      employee_id: string;
      amount: number;
      session_id?: string | null;
    }) => {
      const { data, error } = await supabase.rpc(
        "pdv_settle_employee_consumption" as any,
        {
          p_employee_id: params.employee_id,
          p_amount: params.amount,
          p_session_id: params.session_id || null,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv-emp-consumption-entries"] });
      qc.invalidateQueries({ queryKey: ["pdv-emp-consumption-payments"] });
      qc.invalidateQueries({ queryKey: ["pdv-authorized-employees"] });
      qc.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      qc.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      toast.success("Quitação registrada no caixa");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    entries,
    payments,
    registerConsumption: registerConsumption.mutate,
    isRegistering: registerConsumption.isPending,
    settleConsumption: settleConsumption.mutate,
    isSettling: settleConsumption.isPending,
  };
}
