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
      const stockItems = input.update_stock
        ? input.items.filter((i) => i.ingredient_id && i.quantity > 0)
        : [];

      if (stockItems.length > 0) {
        // 1+2) Despesa e entrada no estoque numa transação só, no banco: ou
        //      entra tudo, ou nada. Antes o estoque era gravado depois, item a
        //      item, e uma falha no meio deixava a despesa lançada sem a
        //      mercadoria. A função também recalcula o custo médio e registra o
        //      documento como compra avulsa, igual à entrada de NF-e.
        // Opcional vazio vai como undefined: a função usa o padrão (null).
        const { error: rpcError } = await supabase.rpc("pdv_quick_expense_with_stock", {
          p_description: input.description,
          p_amount: input.amount,
          p_payment_date: dateStr,
          p_chart_account_id: input.chart_account_id,
          p_items: stockItems.map((i) => ({
            ingredient_id: i.ingredient_id,
            quantity: i.quantity,
            unit_cost: i.unit_cost,
          })),
          p_cost_center_id: input.cost_center_id || undefined,
          p_payment_method: input.payment_method || undefined,
          p_supplier_id: input.supplier_id || undefined,
          p_document_number: input.document_number || undefined,
          p_notes: input.notes || undefined,
          p_update_cost: input.update_cost,
        });
        if (rpcError) throw rpcError;
      } else {
        // 1) Só a despesa, já paga
        const { error: txError } = await supabase
          .from("pdv_financial_transactions")
          .insert([{
            user_id: user.id,
            // O módulo financeiro fala payable/receivable; 'expense' era o
            // vocabulário antigo do banco e fazia a despesa sumir da DRE.
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
            competence_date: dateStr,
            chart_account_id: input.chart_account_id,
            cost_center_id: input.cost_center_id || null,
            payment_method: input.payment_method || null,
            supplier_id: input.supplier_id || null,
            document_number: input.document_number || null,
            notes: input.notes || null,
          }]);

        if (txError) throw txError;
      }

      // 3) Sangria automática no caixa quando paga em dinheiro a partir do caixa
      let cashierWarning: string | null = null;
      if (input.cashier_session_id && input.payment_method === "dinheiro") {
        try {
          const { error: sangriaErr } = await supabase
            .from("pdv_cashier_movements")
            .insert({
              cashier_session_id: input.cashier_session_id,
              type: "sangria",
              amount: input.amount,
              description: `Despesa: ${input.description}`,
            });
          if (sangriaErr) throw sangriaErr;
          await supabase.rpc("pdv_recompute_session_totals", {
            p_session_id: input.cashier_session_id,
          });
        } catch (e: any) {
          console.error("Falha ao registrar sangria automática:", e);
          cashierWarning = e?.message || "Falha ao registrar sangria no caixa";
        }
      }

      return { cashierWarning, stockItems: stockItems.length };
    },
    onSuccess: ({ cashierWarning, stockItems }) => {
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-financial-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-stock-movements"] });
      // A entrada vira compra avulsa na lista de Compras (Importação de NF-e).
      queryClient.invalidateQueries({ queryKey: ["nfe-mde"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      if (cashierWarning) {
        toast.warning(`Despesa salva, mas falhou a sangria no caixa: ${cashierWarning}`);
      } else if (stockItems > 0) {
        toast.success(
          stockItems === 1
            ? "Despesa registrada · 1 insumo entrou no estoque"
            : `Despesa registrada · ${stockItems} insumos entraram no estoque`,
        );
      } else {
        toast.success("Despesa registrada com sucesso");
      }
    },
    onError: (error: any) => {
      toast.error("Erro ao registrar despesa: " + (error?.message || ""));
    },
  });
}
