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
  // Justificativas (texto livre por forma)
  justifications: {
    cash?: string;
    credit?: string;
    debit?: string;
    pix?: string;
    voucher?: string;
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
      if (!isOwner) throw new Error("Apenas o responsável pelo estabelecimento pode abrir o caixa");

      const { data, error } = await supabase
        .from("pdv_cashier_sessions")
        .insert({
          user_id: user.id,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      toast.success("Caixa aberto com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao abrir caixa:", error);
      toast.error("Erro ao abrir caixa");
    },
  });

  // Fechar caixa com conferência por forma de pagamento
  const closeCashier = useMutation({
    mutationFn: async (payload: CloseCashierPayload) => {
      const {
        sessionId,
        declaredCash,
        expectedCash,
        declaredCredit,
        declaredDebit,
        declaredPix,
        declaredVoucher,
        justifications,
        notes,
        riskLevel,
      } = payload;

      const cashDifference = declaredCash - expectedCash;

      // Buscar totais atuais para calcular diferenças por forma
      const { data: session } = await supabase
        .from("pdv_cashier_sessions")
        .select("total_credit, total_debit, total_pix, total_voucher")
        .eq("id", sessionId)
        .single();

      const totalCredit = Number(session?.total_credit) || 0;
      const totalDebit = Number(session?.total_debit) || 0;
      const totalPix = Number(session?.total_pix) || 0;
      const totalVoucher = Number(session?.total_voucher) || 0;

      const creditDiff = declaredCredit != null ? declaredCredit - totalCredit : null;
      const debitDiff = declaredDebit != null ? declaredDebit - totalDebit : null;
      const pixDiff = declaredPix != null ? declaredPix - totalPix : null;
      const voucherDiff = declaredVoucher != null ? declaredVoucher - totalVoucher : null;

      const differenceJustified = !!(
        justifications.cash ||
        justifications.credit ||
        justifications.debit ||
        justifications.pix ||
        justifications.voucher ||
        notes
      );

      const updateData: any = {
        closed_at: new Date().toISOString(),
        closing_balance: declaredCash,
        notes,
        // Compat com colunas antigas (gaveta)
        expected_balance: expectedCash,
        balance_difference: cashDifference,
        difference_justified: differenceJustified,
        fraud_risk_level: riskLevel,
        // Novos campos
        declared_cash: declaredCash,
        cash_difference: cashDifference,
        declared_credit: declaredCredit ?? null,
        declared_debit: declaredDebit ?? null,
        declared_pix: declaredPix ?? null,
        declared_voucher: declaredVoucher ?? null,
        credit_difference: creditDiff,
        debit_difference: debitDiff,
        pix_difference: pixDiff,
        voucher_difference: voucherDiff,
        justification_cash: justifications.cash ?? null,
        justification_credit: justifications.credit ?? null,
        justification_debit: justifications.debit ?? null,
        justification_pix: justifications.pix ?? null,
        justification_voucher: justifications.voucher ?? null,
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

      // Atualizar totais da sessão APENAS para sangria.
      if (type === "sangria") {
        const { error: updateError } = await supabase
          .from("pdv_cashier_sessions")
          .update({
            total_withdrawals: activeSession.total_withdrawals + amount,
          })
          .eq("id", activeSession.id);

        if (updateError) throw updateError;
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

  const isLoading = isLoadingSession || isLoadingMovements;

  return {
    activeSession,
    movements,
    isLoading,
    isLoadingSession: isLoadingSession || isLoadingEstablishment,
    openCashier: openCashier.mutate,
    isOpeningCashier: openCashier.isPending,
    closeCashier: closeCashier.mutate,
    isClosingCashier: closeCashier.isPending,
    addMovement: addMovement.mutate,
    isAddingMovement: addMovement.isPending,
    lastClosedSession,
    lastClosedMovements,
    drawerBalance,
    totalReinforcements,
  };
}
