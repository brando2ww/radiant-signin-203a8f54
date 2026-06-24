import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addMonths, parseISO } from "date-fns";

export interface Bill {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  type: "payable" | "receivable";
  category: string | null;
  status: "pending" | "paid" | "overdue" | "cancelled";
  payment_method: string | null;
  bank_account_id: string | null;
  is_recurring: boolean;
  installments: number;
  current_installment: number;
  parent_bill_id: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillFilters {
  search?: string;
  type?: "payable" | "receivable";
  status?: "pending" | "paid" | "overdue" | "cancelled";
  category?: string;
  startDate?: string;
  endDate?: string;
}

export function useBills(filters?: BillFilters) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: bills, isLoading } = useQuery({
    queryKey: ["bills", user?.id, filters],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      let query = supabase
        .from("bills")
        .select("*")
        .eq("user_id", user.id)
        .order("due_date", { ascending: true });

      if (filters?.search) {
        query = query.ilike("title", `%${filters.search}%`);
      }

      if (filters?.type) {
        query = query.eq("type", filters.type);
      }

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      if (filters?.category) {
        query = query.eq("category", filters.category);
      }

      if (filters?.startDate) {
        query = query.gte("due_date", filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte("due_date", filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Bill[];
    },
    enabled: !!user,
  });

  const { data: stats } = useQuery({
    queryKey: ["bills-stats", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("bills")
        .select("type, status, amount")
        .eq("user_id", user.id);

      if (error) throw error;

      const totalPayable = data
        .filter((b) => b.type === "payable" && b.status === "pending")
        .reduce((sum, b) => sum + b.amount, 0);

      const totalReceivable = data
        .filter((b) => b.type === "receivable" && b.status === "pending")
        .reduce((sum, b) => sum + b.amount, 0);

      const overdue = data.filter((b) => b.status === "overdue").length;

      return { totalPayable, totalReceivable, overdue };
    },
    enabled: !!user,
  });

  const createBill = useMutation({
    mutationFn: async (bill: Omit<Bill, "id" | "user_id" | "created_at" | "updated_at">) => {
      if (!user) throw new Error("Usuário não autenticado");

      // If has installments, create multiple bills
      if (bill.installments > 1) {
        const billsToCreate = [];
        const baseDate = parseISO(bill.due_date);

        for (let i = 0; i < bill.installments; i++) {
          const installmentDueDate = addMonths(baseDate, i);
          
          billsToCreate.push({
            ...bill,
            user_id: user.id,
            current_installment: i + 1,
            parent_bill_id: i === 0 ? null : undefined,
            title: `${bill.title} (${i + 1}/${bill.installments})`,
            due_date: installmentDueDate.toISOString().split('T')[0],
          });
        }

        const { data, error } = await supabase
          .from("bills")
          .insert(billsToCreate)
          .select();

        if (error) throw error;

        // Update parent_bill_id for installments
        if (data && data.length > 1) {
          const parentId = data[0].id;
          
          for (let i = 1; i < data.length; i++) {
            await supabase
              .from("bills")
              .update({ parent_bill_id: parentId })
              .eq("id", data[i].id)
              .eq("user_id", user.id);
          }
        }

        return data;
      } else {
        const { data, error } = await supabase
          .from("bills")
          .insert([{ ...bill, user_id: user.id }])
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bills-stats"] });
      toast.success("Conta criada com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao criar conta: " + error.message);
    },
  });

  const updateBill = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Bill> & { id: string }) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("bills")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bills-stats"] });
      toast.success("Conta atualizada com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar conta: " + error.message);
    },
  });

  const markAsPaid = useMutation({
    mutationFn: async ({ 
      id, 
      payment_method,
      bank_account_id,
      paid_at = new Date().toISOString()
    }: { 
      id: string; 
      payment_method?: string;
      bank_account_id?: string;
      paid_at?: string;
    }) => {
      if (!user) throw new Error("Usuário não autenticado");

      // Get bill details
      const { data: bill, error: billError } = await supabase
        .from("bills")
        .select("*")
        .eq("id", id)
        .single();

      if (billError) throw billError;

      // Update bill status
      const { error: updateError } = await supabase
        .from("bills")
        .update({ 
          status: "paid", 
          paid_at,
          payment_method,
          bank_account_id 
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      // If bank account is selected, update balance and create movement
      if (bank_account_id) {
        const { data: account, error: accountError } = await supabase
          .from("bank_accounts")
          .select("current_balance")
          .eq("id", bank_account_id)
          .single();

        if (accountError) throw accountError;

        const newBalance = bill.type === "receivable"
          ? (account.current_balance || 0) + bill.amount
          : (account.current_balance || 0) - bill.amount;

        await supabase
          .from("bank_accounts")
          .update({ current_balance: newBalance })
          .eq("id", bank_account_id);

        await supabase
          .from("account_movements")
          .insert({
            user_id: user.id,
            bank_account_id,
            amount: bill.type === "receivable" ? bill.amount : -bill.amount,
            type: bill.type === "receivable" ? "credit" : "debit",
            description: bill.title,
            reference_type: "bill",
            reference_id: id,
            balance_after: newBalance,
          });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bills-stats"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements"] });
      toast.success("Conta marcada como paga");
    },
    onError: (error: any) => {
      toast.error("Erro ao marcar como paga: " + error.message);
    },
  });

  const deleteBill = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("bills")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bills-stats"] });
      toast.success("Conta excluída com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir conta: " + error.message);
    },
  });

  return {
    bills: bills || [],
    stats,
    isLoading,
    createBill: createBill.mutateAsync,
    updateBill: updateBill.mutateAsync,
    markAsPaid: markAsPaid.mutateAsync,
    deleteBill: deleteBill.mutateAsync,
    isCreating: createBill.isPending,
    isUpdating: updateBill.isPending,
    isDeleting: deleteBill.isPending,
  };
}
