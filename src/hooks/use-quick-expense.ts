import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

export interface QuickExpenseStockItem {
  ingredient_id: string;
  quantity: number;
  unit_cost: number;
}

export interface QuickExpenseInput {
  description: string;
  amount: number;
  payment_date: Date;
  chart_account_id: string;
  cost_center_id?: string | null;
  payment_method?: string | null;
  supplier_id?: string | null;
  document_number?: string | null;
  notes?: string | null;
  update_stock: boolean;
  update_cost: boolean;
  items: QuickExpenseStockItem[];
  cashier_session_id?: string | null;
}

export function useQuickExpense() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: QuickExpenseInput) => {
      if (!user) throw new Error("Usuário não autenticado");

      const dateStr = format(input.payment_date, "yyyy-MM-dd");

      // 1) Cria a transação financeira como paga
      const { data: tx, error: txError } = await supabase
        .from("pdv_financial_transactions")
        .insert([{
          user_id: user.id,
          transaction_type: "payable",
          status: "paid",
          description: input.description,
          amount: input.amount,
          gross_amount: input.amount,
          net_amount: input.amount,
          fee_percentage_applied: 0,
          fee_fixed_applied: 0,
          fee_amount: 0,
          due_date: dateStr,
          payment_date: dateStr,
          chart_account_id: input.chart_account_id,
          cost_center_id: input.cost_center_id || null,
          payment_method: input.payment_method || null,
          supplier_id: input.supplier_id || null,
          document_number: input.document_number || null,
          notes: input.notes || null,
        }])
        .select()
        .single();

      if (txError) throw txError;

      // 2) Entrada de estoque (best-effort)
      let stockWarning: string | null = null;
      if (input.update_stock && input.items.length > 0) {
        try {
          for (const item of input.items) {
            if (!item.ingredient_id || item.quantity <= 0) continue;

            // movimento
            const { error: movErr } = await supabase
              .from("pdv_stock_movements")
              .insert({
                ingredient_id: item.ingredient_id,
                type: "entrada",
                quantity: item.quantity,
                reason: `Compra - ${input.description}`,
                created_by: user.id,
              });
            if (movErr) throw movErr;

            // busca ingrediente atual
            const { data: ing, error: ingErr } = await supabase
              .from("pdv_ingredients")
              .select("current_stock, unit_cost")
              .eq("id", item.ingredient_id)
              .single();
            if (ingErr) throw ingErr;

            const newStock = Number(ing?.current_stock || 0) + item.quantity;
            const updates: Record<string, any> = {
              current_stock: newStock,
              last_entry_date: dateStr,
            };
            if (input.update_cost && item.unit_cost > 0) {
              updates.unit_cost = item.unit_cost;
            }

            const { error: updErr } = await supabase
              .from("pdv_ingredients")
              .update(updates)
              .eq("id", item.ingredient_id);
            if (updErr) throw updErr;
          }
        } catch (e: any) {
          console.error("Falha na entrada de estoque:", e);
          stockWarning = e?.message || "Falha ao dar entrada no estoque";
        }
      }

      return { tx, stockWarning };
    },
    onSuccess: ({ stockWarning }) => {
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-stock-movements"] });
      if (stockWarning) {
        toast.warning(`Despesa salva, mas houve problema no estoque: ${stockWarning}`);
      } else {
        toast.success("Despesa registrada com sucesso");
      }
    },
    onError: (error: any) => {
      toast.error("Erro ao registrar despesa: " + (error?.message || ""));
    },
  });
}
