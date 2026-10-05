import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { buildPaymentSnapshot } from "@/lib/financial/build-payment-snapshot";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";

export interface PDVFinancialTransaction {
  id: string;
  user_id: string;
  transaction_type: 'payable' | 'receivable';
  amount: number;
  due_date: string;
  competence_date?: string | null;
  payment_date?: string | null;
  status: 'pending' | 'paid' | 'cancelled' | 'overdue';
  chart_account_id?: string | null;
  cost_center_id?: string | null;
  bank_account_id?: string | null;
  description: string;
  supplier_id?: string | null;
  customer_id?: string | null;
  payment_method?: string | null;
  document_number?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialStats {
  totalPayable: number;
  totalReceivable: number;
  totalOverdue: number;
  expectedBalance: number;
  pendingPayableCount: number;
  pendingReceivableCount: number;
  overdueCount: number;
  paidThisMonth: number;
  receivedThisMonth: number;
}

export interface TransactionFilters {
  search?: string;
  transaction_type?: 'payable' | 'receivable' | 'all';
  status?: string[];
  due_date_from?: Date;
  due_date_to?: Date;
  cost_center_id?: string;
  chart_account_id?: string;
  supplier_id?: string;
  customer_id?: string;
  payment_method?: string;
  /** Inclui status='overdue' OU (status='pending' AND due_date < hoje). */
  overdue_only?: boolean;
}

export function usePDVFinancialTransactions(filters?: TransactionFilters) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["pdv-financial-transactions", user?.id, filters],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      let query = supabase
        .from("pdv_financial_transactions")
        .select(`
          *,
          pdv_chart_of_accounts(name),
          pdv_cost_centers(name),
          pdv_suppliers(company_name),
          pdv_customers(name)
        `)
        .eq("user_id", user.id);

      // Apply filters
      if (filters?.search) {
        query = query.ilike("description", `%${filters.search}%`);
      }

      if (filters?.transaction_type && filters.transaction_type !== 'all') {
        query = query.eq("transaction_type", filters.transaction_type);
      }

      if (filters?.status && filters.status.length > 0) {
        query = query.in("status", filters.status);
      }

      if (filters?.overdue_only) {
        const today = format(new Date(), "yyyy-MM-dd");
        query = query.or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`);
      }

      if (filters?.due_date_from) {
        query = query.gte("due_date", format(filters.due_date_from, "yyyy-MM-dd"));
      }

      if (filters?.due_date_to) {
        query = query.lte("due_date", format(filters.due_date_to, "yyyy-MM-dd"));
      }

      if (filters?.cost_center_id) {
        query = query.eq("cost_center_id", filters.cost_center_id);
      }

      if (filters?.chart_account_id) {
        query = query.eq("chart_account_id", filters.chart_account_id);
      }

      if (filters?.supplier_id) {
        query = query.eq("supplier_id", filters.supplier_id);
      }

      if (filters?.customer_id) {
        query = query.eq("customer_id", filters.customer_id);
      }

      if (filters?.payment_method) {
        query = query.eq("payment_method", filters.payment_method);
      }

      const { data, error } = await query.order("due_date", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  /**
   * Os números do topo saem da MESMA lista que a tabela mostra.
   *
   * Antes eram uma consulta separada, sem filtro nenhum: você filtrava por
   * fornecedor e a tabela mudava, mas os cartões continuavam mostrando o total
   * geral. Duas verdades na mesma tela é o que fazia a página parecer errada.
   */
  const stats = useMemo<FinancialStats>(() => {
    const hoje = format(new Date(), "yyyy-MM-dd");
    const s: FinancialStats = {
      totalPayable: 0,
      totalReceivable: 0,
      totalOverdue: 0,
      expectedBalance: 0,
      pendingPayableCount: 0,
      pendingReceivableCount: 0,
      overdueCount: 0,
      paidThisMonth: 0,
      receivedThisMonth: 0,
    };

    (transactions || []).forEach((t: any) => {
      const valor = Number(t.amount || 0);
      const emAberto = t.status === "pending" || t.status === "overdue";

      if (emAberto) {
        if (t.transaction_type === "payable") {
          s.totalPayable += valor;
          s.pendingPayableCount++;
        } else {
          s.totalReceivable += valor;
          s.pendingReceivableCount++;
        }
        if (t.due_date && t.due_date < hoje) {
          s.totalOverdue += valor;
          s.overdueCount++;
        }
      }

      if (t.status === "paid") {
        if (t.transaction_type === "payable") s.paidThisMonth += valor;
        else s.receivedThisMonth += valor;
      }
    });

    s.expectedBalance = s.totalReceivable - s.totalPayable;
    return s;
  }, [transactions]);

  const createTransaction = useMutation({
    mutationFn: async (transaction: Omit<PDVFinancialTransaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!user) throw new Error("Usuário não autenticado");

      // Snapshot de taxa por forma de pagamento (apenas se for entrada/recebimento)
      let feeColumns: Record<string, number> = {
        gross_amount: Number(transaction.amount) || 0,
        fee_percentage_applied: 0,
        fee_fixed_applied: 0,
        fee_amount: 0,
        net_amount: Number(transaction.amount) || 0,
      };
      if (transaction.transaction_type === 'receivable' && transaction.payment_method) {
        const snap = await buildPaymentSnapshot(
          user.id,
          transaction.payment_method,
          Number(transaction.amount) || 0,
        );
        feeColumns = snap.columns as any;
      }

      const repeticao = (transaction as any).repeat_mode ?? "single";
      const parcelas = Number((transaction as any).installment_total ?? 0);
      const valorEhTotal = (transaction as any).installment_amount_is_total !== false;
      const recorrencia = (transaction as any).recurrence ?? "monthly";
      const recorrenciaAte = (transaction as any).recurrence_until as Date | null | undefined;

      // Os campos de controle do formulário não são colunas da tabela.
      const base: any = { ...transaction };
      delete base.repeat_mode;
      delete base.installment_amount_is_total;
      if (repeticao !== "installments") delete base.installment_total;

      const venc = transaction.due_date as Date;
      const comp = (transaction.competence_date as Date) || venc;
      const dia = (d: Date) => format(d, "yyyy-MM-dd");

      // ---- Parcelado: uma linha por vencimento, cada uma no seu mês ----------
      if (repeticao === "installments" && parcelas >= 2) {
        const total = Number(transaction.amount) || 0;
        const cada = valorEhTotal ? Math.floor((total / parcelas) * 100) / 100 : total;
        // A diferença de arredondamento vai toda para a última parcela, senão a
        // soma das parcelas não bate com o total lançado.
        const somaAnteriores = cada * (parcelas - 1);
        const ultima = valorEhTotal ? Math.round((total - somaAnteriores) * 100) / 100 : total;

        const grupo = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
        const linhas = Array.from({ length: parcelas }, (_, i) => ({
          ...base,
          ...feeColumns,
          amount: i === parcelas - 1 ? ultima : cada,
          gross_amount: i === parcelas - 1 ? ultima : cada,
          net_amount: i === parcelas - 1 ? ultima : cada,
          user_id: user.id,
          description: `${transaction.description} (${i + 1}/${parcelas})`,
          due_date: dia(addMonths(venc, i)),
          competence_date: dia(addMonths(comp, i)),
          payment_date: null,
          // Só a primeira pode nascer paga; as outras ainda nem venceram.
          status: i === 0 ? (transaction.status ?? "pending") : "pending",
          group_id: grupo,
          installment_number: i + 1,
          installment_total: parcelas,
          recurrence: "none",
        }));

        const { data, error } = await supabase
          .from("pdv_financial_transactions")
          .insert(linhas)
          .select();
        if (error) throw error;
        return (data ?? [])[0];
      }

      // ---- Recorrente: a âncora, e o horizonte preenchido pelo banco --------
      const { data, error } = await supabase
        .from("pdv_financial_transactions")
        .insert([{
          ...base,
          ...feeColumns,
          user_id: user.id,
          due_date: dia(venc),
          competence_date: dia(comp),
          payment_date: transaction.payment_date ? dia(transaction.payment_date as Date) : null,
          recurrence: repeticao === "recurring" ? recorrencia : "none",
          recurrence_until:
            repeticao === "recurring" && recorrenciaAte ? dia(recorrenciaAte) : null,
        }])
        .select()
        .single();

      if (error) throw error;

      if (repeticao === "recurring") {
        // Gera as ocorrências futuras até 12 meses à frente (ou até a data de
        // fim). Uma falha aqui não desfaz o lançamento: a âncora existe e o
        // horizonte é completado na próxima abertura do módulo.
        const { error: extErr } = await supabase.rpc("pdv_extend_recurring_transactions", {
          _user_id: user.id,
        });
        if (extErr) console.error("[financeiro] falha ao gerar recorrências", extErr);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-stats"] });
      toast.success("Lançamento criado com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao criar lançamento: " + error.message);
    },
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...transaction }: Partial<PDVFinancialTransaction> & { id: string }) => {
      const { data, error } = await supabase
        .from("pdv_financial_transactions")
        .update({
          ...transaction,
          due_date: transaction.due_date ? format(transaction.due_date as Date, "yyyy-MM-dd") : undefined,
          competence_date: transaction.competence_date
            ? format(transaction.competence_date as Date, "yyyy-MM-dd")
            : undefined,
          payment_date: transaction.payment_date ? format(transaction.payment_date as Date, "yyyy-MM-dd") : null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-stats"] });
      toast.success("Lançamento atualizado com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar lançamento: " + error.message);
    },
  });

  /**
   * Edita o grupo inteiro: todas as parcelas ou ocorrências AINDA EM ABERTO.
   *
   * Parcela já paga é fato consumado — alterá-la reescreveria o passado e
   * desalinharia a conciliação. Por isso o filtro por status, e não uma
   * atualização cega pelo group_id.
   */
  const updateGroup = useMutation({
    mutationFn: async ({ groupId, changes }: { groupId: string; changes: Record<string, any> }) => {
      const payload: any = { ...changes };
      // Nunca em lote: cada parcela tem o seu.
      delete payload.due_date;
      delete payload.competence_date;
      delete payload.payment_date;
      delete payload.status;
      delete payload.installment_number;
      delete payload.installment_total;
      delete payload.group_id;

      const { data, error } = await supabase
        .from("pdv_financial_transactions")
        .update(payload)
        .eq("group_id", groupId)
        .in("status", ["pending", "overdue"])
        .select("id");
      if (error) throw error;
      return (data ?? []).length;
    },
    onSuccess: (qtd) => {
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-stats"] });
      toast.success(`${qtd} lançamento${qtd === 1 ? "" : "s"} do grupo atualizado${qtd === 1 ? "" : "s"}`);
    },
    onError: (error: any) => toast.error("Erro ao atualizar o grupo: " + error.message),
  });

  /** Remove as parcelas em aberto de um grupo; as pagas permanecem. */
  const deleteGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const { data, error } = await supabase
        .from("pdv_financial_transactions")
        .delete()
        .eq("group_id", groupId)
        .in("status", ["pending", "overdue"])
        .select("id");
      if (error) throw error;
      return (data ?? []).length;
    },
    onSuccess: (qtd) => {
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-stats"] });
      toast.success(`${qtd} lançamento${qtd === 1 ? "" : "s"} em aberto removido${qtd === 1 ? "" : "s"}`);
    },
    onError: (error: any) => toast.error("Erro ao remover o grupo: " + error.message),
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pdv_financial_transactions")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-stats"] });
      toast.success("Lançamento excluído com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir lançamento: " + error.message);
    },
  });

  const markAsPaid = useMutation({
    mutationFn: async ({ id, payment_date, payment_method, bank_account_id }: { 
      id: string; 
      payment_date: Date;
      payment_method?: string;
      bank_account_id?: string;
    }) => {
      // Buscar o registro para conhecer tipo + valor e gerar snapshot de taxa
      const { data: existing } = await supabase
        .from("pdv_financial_transactions")
        .select("amount, transaction_type, description")
        .eq("id", id)
        .single();

      const updatePayload: any = {
        status: 'paid',
        payment_date: format(payment_date, "yyyy-MM-dd"),
        payment_method,
        bank_account_id,
      };

      if (existing && existing.transaction_type === 'receivable' && payment_method && user) {
        const snap = await buildPaymentSnapshot(
          user.id,
          payment_method,
          Number(existing.amount) || 0,
        );
        Object.assign(updatePayload, snap.columns);
      }

      const { data, error } = await supabase
        .from("pdv_financial_transactions")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Atualiza saldo da conta bancária PDV ao marcar como pago
      if (bank_account_id && existing && user) {
        const { data: account } = await supabase
          .from("pdv_bank_accounts")
          .select("current_balance")
          .eq("id", bank_account_id)
          .single();

        if (account) {
          const delta = existing.transaction_type === "receivable"
            ? Number(existing.amount)
            : -Number(existing.amount);
          const newBalance = (account.current_balance || 0) + delta;

          await supabase
            .from("pdv_bank_accounts")
            .update({ current_balance: newBalance })
            .eq("id", bank_account_id);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-bank-accounts"] });
      toast.success("Lançamento marcado como pago");
    },
    onError: (error: any) => {
      toast.error("Erro ao marcar como pago: " + error.message);
    },
  });

  return {
    transactions: transactions || [],
    stats: stats ?? {
      totalPayable: 0,
      totalReceivable: 0,
      totalOverdue: 0,
      expectedBalance: 0,
      pendingPayableCount: 0,
      pendingReceivableCount: 0,
      overdueCount: 0,
      paidThisMonth: 0,
      receivedThisMonth: 0,
    },
    isLoading,
    createTransaction: createTransaction.mutateAsync,
    updateTransaction: updateTransaction.mutateAsync,
    updateGroup: updateGroup.mutateAsync,
    deleteGroup: deleteGroup.mutateAsync,
    deleteTransaction: deleteTransaction.mutateAsync,
    markAsPaid: markAsPaid.mutateAsync,
    isCreating: createTransaction.isPending,
    isUpdating: updateTransaction.isPending,
    isDeleting: deleteTransaction.isPending,
  };
}
