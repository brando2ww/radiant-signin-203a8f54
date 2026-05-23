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
  subtotal: number;
  discount: number;
  discount_reason: string | null;
  coupon_code: string | null;
  notes: string | null;
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
      discount?: number;
      discount_reason?: string;
      coupon_code?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc(
        "pdv_register_employee_consumption" as any,
        {
          p_employee_id: params.employee_id,
          p_items: params.items as any,
          p_justification: params.justification || null,
          p_discount: params.discount || 0,
          p_discount_reason: params.discount_reason || null,
          p_coupon_code: params.coupon_code || null,
          p_notes: params.notes || null,
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

  const registerCreditSale = useMutation({
    mutationFn: async (params: {
      employee_id: string;
      employee_name?: string;
      comanda_id?: string | null;
      comanda_ids?: string[];
      order_id?: string | null;
      amount: number;
      items: ConsumptionItemInput[];
      justification?: string | null;
    }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      const ownerId = visibleUserId || user.id;
      const comandaIds = (params.comanda_ids && params.comanda_ids.length > 0)
        ? params.comanda_ids
        : (params.comanda_id ? [params.comanda_id] : []);
      if (comandaIds.length === 0) throw new Error("Comanda não informada");

      const { data: entry, error: entryError } = await supabase
        .from("pdv_employee_consumption_entries")
        .insert({
          user_id: ownerId,
          employee_id: params.employee_id,
          operator_id: user.id,
          comanda_id: comandaIds[0],
          total: params.amount,
          paid_amount: 0,
          status: "pendente",
          items: params.items as any,
          over_limit_justification: params.justification || null,
        })
        .select()
        .single();
      if (entryError) throw entryError;

      const { data: closed, error: closeError } = await supabase
        .from("pdv_comandas")
        .update({ status: "fechada", updated_at: new Date().toISOString() })
        .in("id", comandaIds)
        .in("status", ["aberta", "aguardando_pagamento", "em_cobranca"])
        .select();
      if (closeError) throw closeError;
      if (!closed || closed.length === 0) throw new Error("Comanda já finalizada");

      if (params.order_id) {
        const { count } = await supabase
          .from("pdv_comandas")
          .select("*", { count: "exact", head: true })
          .eq("order_id", params.order_id)
          .in("status", ["aberta", "aguardando_pagamento", "em_cobranca"]);
        if ((count ?? 0) === 0) {
          await supabase
            .from("pdv_orders")
            .update({ status: "fechada", updated_at: new Date().toISOString() })
            .eq("id", params.order_id);
          await supabase
            .from("pdv_tables")
            .update({ status: "livre", current_order_id: null, updated_at: new Date().toISOString() })
            .eq("current_order_id", params.order_id);
        }

        await supabase.from("pdv_payments").insert({
          order_id: params.order_id,
          payment_method: "fiado",
          amount: params.amount,
        });
      }

      // Registra a venda a prazo como movimento no caixa ativo (informativo,
      // não impacta a gaveta de dinheiro físico).
      const { data: activeSession } = await supabase
        .from("pdv_cashier_sessions")
        .select("id")
        .eq("user_id", ownerId)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .maybeSingle();

      if (activeSession?.id) {
        const description = params.employee_name
          ? `Venda a prazo — ${params.employee_name}`
          : "Venda a prazo";
        const { error: mErr } = await supabase.from("pdv_cashier_movements").insert({
          cashier_session_id: activeSession.id,
          type: "venda",
          payment_method: "fiado",
          amount: params.amount,
          description,
          source: "salon",
        } as any);
        if (mErr) throw mErr;
        await supabase.rpc("pdv_recompute_session_totals", { p_session_id: activeSession.id });
      }

      return entry as ConsumptionEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv-emp-consumption-entries"] });
      qc.invalidateQueries({ queryKey: ["pdv-authorized-employees"] });
      qc.invalidateQueries({ queryKey: ["pdv-comandas"] });
      qc.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      qc.invalidateQueries({ queryKey: ["pdv-tables"] });
      qc.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      qc.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      toast.success("Venda lançada a prazo");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao lançar a prazo"),
  });

  return {
    entries,
    payments,
    registerConsumption: registerConsumption.mutate,
    isRegistering: registerConsumption.isPending,
    settleConsumption: settleConsumption.mutate,
    isSettling: settleConsumption.isPending,
    registerCreditSale: registerCreditSale.mutateAsync,
    isRegisteringCreditSale: registerCreditSale.isPending,
  };
}
