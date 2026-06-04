import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { buildPaymentSnapshot } from "@/lib/financial/build-payment-snapshot";
import { toast } from "sonner";
import { format } from "date-fns";

export interface PDVFinancialTransaction {
  id: string;
  user_id: string;
  transaction_type: 'payable' | 'receivable';
  amount: number;
  due_date: string;
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

  const { data: stats } = useQuery({
    queryKey: ["pdv-financial-stats", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      const today = format(new Date(), "yyyy-MM-dd");
      const firstDayOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");

      const { data: allTransactions, error } = await supabase
        .from("pdv_financial_transactions")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;

      const stats: FinancialStats = {
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

      allTransactions?.forEach(t => {
        if (t.status === 'pending') {
          if (t.transaction_type === 'payable') {
            stats.totalPayable += Number(t.amount);
            stats.pendingPayableCount++;
          } else {
            stats.totalReceivable += Number(t.amount);
            stats.pendingReceivableCount++;
          }

          if (t.due_date < today) {
            stats.totalOverdue += Number(t.amount);
            stats.overdueCount++;
          }
        }

        if (t.status === 'paid' && t.payment_date && t.payment_date >= firstDayOfMonth) {
          if (t.transaction_type === 'payable') {
            stats.paidThisMonth += Number(t.amount);
          } else {
            stats.receivedThisMonth += Number(t.amount);
          }
        }
      });

      stats.expectedBalance = stats.totalReceivable - stats.totalPayable;

      return stats;
    },
    enabled: !!user,
  });

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

      const { data, error } = await supabase
        .from("pdv_financial_transactions")
        .insert([{
          ...transaction,
          ...feeColumns,
          user_id: user.id,
          due_date: transaction.due_date ? format(new Date(transaction.due_date), "yyyy-MM-dd") : undefined,
          payment_date: transaction.payment_date ? format(new Date(transaction.payment_date), "yyyy-MM-dd") : null,
        }])
        .select()
        .single();

      if (error) throw error;
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
          due_date: transaction.due_date ? format(new Date(transaction.due_date), "yyyy-MM-dd") : undefined,
          payment_date: transaction.payment_date ? format(new Date(transaction.payment_date), "yyyy-MM-dd") : null,
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
        .select("amount, transaction_type")
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
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-stats"] });
      toast.success("Lançamento marcado como pago");
    },
    onError: (error: any) => {
      toast.error("Erro ao marcar como pago: " + error.message);
    },
  });

  return {
    transactions: transactions || [],
    stats: stats || {
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
    deleteTransaction: deleteTransaction.mutateAsync,
    markAsPaid: markAsPaid.mutateAsync,
    isCreating: createTransaction.isPending,
    isUpdating: updateTransaction.isPending,
    isDeleting: deleteTransaction.isPending,
  };
}
