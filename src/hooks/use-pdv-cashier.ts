import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

interface CashierSession {
  id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  closing_balance: number | null;
  total_sales: number;
  total_cash: number;
  total_card: number;
  total_credit: number;
  total_debit: number;
  total_pix: number;
  total_voucher: number;
  total_change: number;
  total_withdrawals: number;
  notes: string | null;
}

interface CashMovement {
  id: string;
  cashier_session_id: string;
  type: "entrada" | "sangria" | "reforco" | "venda";
  amount: number;
  payment_method?:
    | "dinheiro"
    | "cartao"
    | "credito"
    | "debito"
    | "pix"
    | "vale_refeicao";
  description: string | null;
  created_at: string;
  source?: "salon" | "delivery" | "delivery_online" | null;
}

export interface CloseCashierPayload {
  sessionId: string;
  // Gaveta
  declaredCash: number;
  expectedCash: number;
  // Conferência por forma
  declaredCredit?: number | null;
  declaredDebit?: number | null;
  declaredPix?: number | null;
  declaredVoucher?: number | null;
  declaredOnlineDelivery?: number | null;
  declaredOther?: number | null;
  declaredFiado?: number | null;
  // Totais
  declaredTotalSales?: number | null;
  totalDifference?: number | null;
  closingStatus?: "no_difference" | "reconciled_with_mismatch" | "surplus" | "shortage";
  closingJustification?: string | null;
  // Justificativas (texto livre por forma — legado)
  justifications: {
    cash?: string;
    credit?: string;
    debit?: string;
    pix?: string;
    voucher?: string;
    onlineDelivery?: string;
    other?: string;
    fiado?: string;
  };
  notes?: string;
  riskLevel: "ok" | "low" | "medium" | "high" | "critical";
}

export function usePDVCashier() {
  const { user } = useAuth();
  const { visibleUserId, isLoading: isLoadingEstablishment } = useEstablishmentId();
  const queryClient = useQueryClient();
  const isOwner = !!user?.id && !!visibleUserId && user.id === visibleUserId;

  // Buscar sessão ativa do caixa (do dono do estabelecimento — staff compartilha)
  const { data: activeSession, isLoading: isLoadingSession } = useQuery({
    queryKey: ["pdv-cashier-active", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return null;

      const { data, error } = await supabase
        .from("pdv_cashier_sessions")
        .select("*")
        .eq("user_id", visibleUserId)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CashierSession | null;
    },
    enabled: !!visibleUserId && !isLoadingEstablishment,
  });

  // Buscar movimentações da sessão ativa
  const { data: movements = [], isLoading: isLoadingMovements } = useQuery({
    queryKey: ["pdv-cashier-movements", activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];

      const { data, error } = await supabase
        .from("pdv_cashier_movements")
        .select("*")
        .eq("cashier_session_id", activeSession.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as CashMovement[];
    },
    enabled: !!activeSession?.id,
  });

  // Abrir caixa
  const openCashier = useMutation({
    mutationFn: async ({ openingBalance }: { openingBalance: number }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (!visibleUserId) throw new Error("Estabelecimento não resolvido");
      if (!isOwner) throw new Error("Apenas o responsável pelo estabelecimento pode abrir o caixa");

      // Se já existe sessão aberta, reutiliza em vez de duplicar
      const { data: existing } = await supabase
        .from("pdv_cashier_sessions")
        .select("*")
        .eq("user_id", visibleUserId)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) return existing as CashierSession;

      const { data, error } = await supabase
        .from("pdv_cashier_sessions")
        .insert({
          user_id: visibleUserId,
          opened_by_user_id: user.id,
          opening_balance: openingBalance,
          total_sales: 0,
          total_cash: 0,
          total_card: 0,
          total_pix: 0,
          total_withdrawals: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["pdv-cashier-active", visibleUserId], data);
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      toast.success("Caixa aberto com sucesso!");
    },
    onError: (error: any) => {
      console.error("Erro ao abrir caixa:", error);
      toast.error(error?.message || "Erro ao abrir caixa");
    },
  });

  // Fechar caixa com conferência por forma de pagamento
  const closeCashier = useMutation({
    mutationFn: async (payload: CloseCashierPayload) => {
      const {
        sessionId,
        declaredCash,
        declaredCredit,
        declaredDebit,
        declaredPix,
        declaredVoucher,
        declaredOnlineDelivery,
        declaredOther,
        declaredFiado,
        declaredTotalSales,
        totalDifference,
        closingStatus,
        closingJustification,
        justifications,
        notes,
        riskLevel,
      } = payload;

      // 1. Garante totais consistentes com os movements antes de calcular.
      await supabase.rpc("pdv_recompute_session_totals", { p_session_id: sessionId });

      // 2. Lê os totais já reconciliados + opening_balance + reforços.
      const { data: session } = await supabase
        .from("pdv_cashier_sessions")
        .select("opening_balance, total_cash, total_credit, total_debit, total_pix, total_voucher, total_online_delivery, total_other, total_fiado, total_withdrawals")
        .eq("id", sessionId)
        .single();

      const { data: reinforcementRows } = await supabase
        .from("pdv_cashier_movements")
        .select("amount")
        .eq("cashier_session_id", sessionId)
        .eq("type", "reforco");

      const reinforcements = (reinforcementRows || []).reduce(
        (acc: number, r: any) => acc + Number(r.amount || 0),
        0,
      );

      const openingBalance = Number(session?.opening_balance) || 0;
      const totalCash = Number(session?.total_cash) || 0;
      const totalCredit = Number(session?.total_credit) || 0;
      const totalDebit = Number(session?.total_debit) || 0;
      const totalPix = Number(session?.total_pix) || 0;
      const totalVoucher = Number(session?.total_voucher) || 0;
      const totalOnlineDelivery = Number(session?.total_online_delivery) || 0;
      const totalOther = Number((session as any)?.total_other) || 0;
      const totalFiado = Number((session as any)?.total_fiado) || 0;
      const totalWithdrawals = Number(session?.total_withdrawals) || 0;

      const expectedCash = openingBalance + totalCash + reinforcements - totalWithdrawals;
      const cashDifference = declaredCash - expectedCash;

      const creditDiff = declaredCredit != null ? declaredCredit - totalCredit : null;
      const debitDiff = declaredDebit != null ? declaredDebit - totalDebit : null;
      const pixDiff = declaredPix != null ? declaredPix - totalPix : null;
      const voucherDiff = declaredVoucher != null ? declaredVoucher - totalVoucher : null;
      const onlineDiff = declaredOnlineDelivery != null ? declaredOnlineDelivery - totalOnlineDelivery : null;
      const otherDiff = declaredOther != null ? declaredOther - totalOther : null;
      const fiadoDiff = declaredFiado != null ? declaredFiado - totalFiado : null;

      const differenceJustified = !!(
        justifications.cash ||
        justifications.credit ||
        justifications.debit ||
        justifications.pix ||
        justifications.voucher ||
        justifications.onlineDelivery ||
        justifications.other ||
        justifications.fiado ||
        closingJustification ||
        notes
      );

      const updateData: any = {
        closed_at: new Date().toISOString(),
        closed_by_user_id: user?.id ?? null,
        closing_balance: declaredCash,
        notes,
        expected_balance: expectedCash,
        balance_difference: cashDifference,
        difference_justified: differenceJustified,
        fraud_risk_level: riskLevel,
        declared_cash: declaredCash,
        cash_difference: cashDifference,
        declared_credit: declaredCredit ?? null,
        declared_debit: declaredDebit ?? null,
        declared_pix: declaredPix ?? null,
        declared_voucher: declaredVoucher ?? null,
        declared_online_delivery: declaredOnlineDelivery ?? null,
        declared_other: declaredOther ?? null,
        declared_fiado: declaredFiado ?? null,
        credit_difference: creditDiff,
        debit_difference: debitDiff,
        pix_difference: pixDiff,
        voucher_difference: voucherDiff,
        online_delivery_difference: onlineDiff,
        other_difference: otherDiff,
        fiado_difference: fiadoDiff,
        justification_cash: justifications.cash ?? null,
        justification_credit: justifications.credit ?? null,
        justification_debit: justifications.debit ?? null,
        justification_pix: justifications.pix ?? null,
        justification_voucher: justifications.voucher ?? null,
        justification_online_delivery: justifications.onlineDelivery ?? null,
        justification_other: justifications.other ?? null,
        justification_fiado: justifications.fiado ?? null,
        declared_total_sales: declaredTotalSales ?? null,
        total_difference: totalDifference ?? null,
        closing_status: closingStatus ?? null,
        closing_justification: closingJustification ?? null,
      };

      const { data, error } = await supabase
        .from("pdv_cashier_sessions")
        .update(updateData)
        .eq("id", sessionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-last-closed"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-last-closed-movements"] });
      toast.success("Caixa fechado com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao fechar caixa:", error);
      toast.error("Erro ao fechar caixa");
    },
  });

  // Calcular saldo da gaveta — fonte única de verdade
  const totalReinforcements = movements
    .filter((m) => m.type === "reforco")
    .reduce((acc, m) => acc + Number(m.amount || 0), 0);

  const drawerBalance = activeSession
    ? Number(activeSession.opening_balance || 0)
      + Number(activeSession.total_cash || 0)
      + totalReinforcements
      - Number(activeSession.total_withdrawals || 0)
    : 0;

  // Adicionar movimentação (sangria/reforço)
  const addMovement = useMutation({
    mutationFn: async ({
      type,
      amount,
      description,
    }: {
      type: "sangria" | "reforco";
      amount: number;
      description?: string;
    }) => {
      if (!activeSession?.id) throw new Error("Nenhuma sessão de caixa ativa");

      // Defesa em profundidade: bloquear sangria acima do saldo
      if (type === "sangria" && amount > drawerBalance + 0.001) {
        throw new Error(
          `Sangria não permitida — valor (${amount.toFixed(2)}) maior que o saldo da gaveta (${drawerBalance.toFixed(2)}).`
        );
      }

      const { error: movError } = await supabase
        .from("pdv_cashier_movements")
        .insert({
          cashier_session_id: activeSession.id,
          type,
          amount,
          description,
        });

      if (movError) throw movError;

      // Recalcula totais da sessão atomicamente (sangria afeta total_withdrawals)
      if (type === "sangria") {
        await supabase.rpc("pdv_recompute_session_totals", { p_session_id: activeSession.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      toast.success("Movimentação registrada com sucesso!");
    },
    onError: (error: any) => {
      console.error("Erro ao registrar movimentação:", error);
      toast.error(error?.message || "Erro ao registrar movimentação");
    },
  });

  // Buscar última sessão fechada
  const { data: lastClosedSession } = useQuery({
    queryKey: ["pdv-cashier-last-closed", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return null;

      const { data, error } = await supabase
        .from("pdv_cashier_sessions")
        .select("*")
        .eq("user_id", visibleUserId)
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CashierSession | null;
    },
    enabled: !!visibleUserId && !isLoadingEstablishment,
  });

  // Buscar movimentações da última sessão fechada
  const { data: lastClosedMovements = [] } = useQuery({
    queryKey: ["pdv-cashier-last-closed-movements", lastClosedSession?.id],
    queryFn: async () => {
      if (!lastClosedSession?.id) return [];

      const { data, error } = await supabase
        .from("pdv_cashier_movements")
        .select("*")
        .eq("cashier_session_id", lastClosedSession.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as CashMovement[];
    },
    enabled: !!lastClosedSession?.id,
  });

  // Submeter Etapa 1 (apuração às cegas) — gera snapshot imutável p/ auditoria
  const submitBlindClosing = useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      declaredCash: number;
      declaredCredit?: number | null;
      declaredDebit?: number | null;
      declaredPix?: number | null;
      declaredVoucher?: number | null;
      declaredOnlineDelivery?: number | null;
      declaredOther?: number | null;
      declaredFiado?: number | null;
      declaredTotal: number;
    }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (!visibleUserId) throw new Error("Estabelecimento não resolvido");

      const { data, error } = await supabase
        .from("pdv_cashier_close_blind_snapshots")
        .insert({
          cashier_session_id: payload.sessionId,
          user_id: visibleUserId,
          operator_id: user.id,
          declared_cash: payload.declaredCash,
          declared_credit: payload.declaredCredit ?? null,
          declared_debit: payload.declaredDebit ?? null,
          declared_pix: payload.declaredPix ?? null,
          declared_voucher: payload.declaredVoucher ?? null,
          declared_online_delivery: payload.declaredOnlineDelivery ?? null,
          declared_other: payload.declaredOther ?? null,
          declared_fiado: payload.declaredFiado ?? null,
          declared_total: payload.declaredTotal,
        } as any)
        .select()
        .single();

      if (error) throw error;

      await supabase.rpc("pdv_recompute_session_totals", { p_session_id: payload.sessionId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-blind-snapshots"] });
    },
    onError: (error: any) => {
      const msg = String(error?.message || "");
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error("Já existe uma apuração registrada para esta sessão.");
      } else {
        toast.error("Erro ao registrar apuração: " + msg);
      }
    },
  });

  const isLoading =
    isLoadingEstablishment ||
    isLoadingSession ||
    (!!activeSession?.id && isLoadingMovements);

  return {
    activeSession,
    movements,
    isLoading,
    isLoadingSession: isLoadingSession || isLoadingEstablishment,
    openCashier: openCashier.mutate,
    isOpeningCashier: openCashier.isPending,
    closeCashier: closeCashier.mutate,
    isClosingCashier: closeCashier.isPending,
    submitBlindClosing: submitBlindClosing.mutateAsync,
    isSubmittingBlind: submitBlindClosing.isPending,
    addMovement: addMovement.mutate,
    isAddingMovement: addMovement.isPending,
    lastClosedSession,
    lastClosedMovements,
    drawerBalance,
    totalReinforcements,
  };
}
