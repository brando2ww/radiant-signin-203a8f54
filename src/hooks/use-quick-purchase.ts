/**
 * Compra avulsa: "fui ao mercado e comprei mercadoria".
 *
 * Diferente da importação de NF-e, aqui não existe documento fiscal para
 * conferir — o foco é dar entrada no estoque rápido e jogar o gasto no
 * financeiro. Por isso: só insumo JÁ CADASTRADO (nada de criar insumo no meio
 * da pressa, que é como catálogo vira lixo), sem impostos, sem parcelas.
 *
 * Grava exatamente onde a importação de nota grava, para o histórico ficar num
 * lugar só: pdv_invoices (source 'manual'), pdv_invoice_items,
 * pdv_stock_movements e o custo do insumo.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateInvoice, useCreateInvoiceItems } from "@/hooks/use-pdv-invoices";
import { usePDVFinancialTransactions } from "@/hooks/use-pdv-financial-transactions";
import { toast } from "sonner";

export interface QuickPurchaseItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export interface QuickPurchaseInput {
  purchaseDate: Date;
  items: QuickPurchaseItem[];
  supplierId: string | null;
  supplierName: string;
  paid: boolean;
  paymentMethod: string;
  /** Só quando não está pago. */
  dueDate?: Date;
  notes?: string;
}

const iso = (d: Date) => d.toISOString();
const dateOnly = (d: Date) => iso(d).slice(0, 10);

export function useQuickPurchase() {
  const { user } = useAuth();
  const createInvoice = useCreateInvoice();
  const createInvoiceItems = useCreateInvoiceItems();
  const { createTransaction } = usePDVFinancialTransactions();
  const [saving, setSaving] = useState(false);

  const save = async (input: QuickPurchaseInput): Promise<boolean> => {
    if (!user) return false;
    const items = input.items.filter((i) => i.ingredientId && i.quantity > 0);
    if (!items.length) {
      toast.error("Adicione ao menos um item com quantidade.");
      return false;
    }

    const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    setSaving(true);
    try {
      // 1) Financeiro. Pago ou a pagar, o gasto tem que existir — compra de
      //    mercado paga no cartão some do fluxo de caixa se não for lançada.
      const transaction = await createTransaction({
        transaction_type: "payable",
        description: `Compra avulsa${input.supplierName ? ` · ${input.supplierName}` : ""}`,
        amount: total,
        due_date: iso(input.paid ? input.purchaseDate : input.dueDate ?? input.purchaseDate),
        payment_date: input.paid ? iso(input.purchaseDate) : null,
        status: input.paid ? "paid" : "pending",
        supplier_id: input.supplierId,
        payment_method: input.paymentMethod || null,
        notes: input.notes || null,
      } as any);

      // 2) Documento. invoice_key é UNIQUE global, então compra sem nota ganha
      //    uma chave sintética — sem isso, o segundo lançamento colide.
      const syntheticKey = `MANUAL-${crypto.randomUUID()}`;
      const invoice = await createInvoice.mutateAsync({
        invoice_number: `AVULSA-${dateOnly(input.purchaseDate)}`,
        invoice_key: syntheticKey,
        series: "",
        emission_date: iso(input.purchaseDate),
        entry_date: iso(input.purchaseDate),
        supplier_id: input.supplierId,
        supplier_cnpj: "",
        supplier_name: input.supplierName || "Compra avulsa",
        total_products: total,
        total_tax: 0,
        total_invoice: total,
        freight_value: 0,
        insurance_value: 0,
        other_expenses: 0,
        discount_value: 0,
        operation_type: "entrada",
        invoice_type: "compra",
        status: "imported",
        source: "manual",
        financial_transaction_id: (transaction as any)?.id ?? null,
        notes: input.notes || null,
      } as any);

      await createInvoiceItems.mutateAsync(
        items.map((item, idx) => ({
          invoice_id: invoice.id,
          item_number: idx + 1,
          product_name: item.ingredientName,
          unit: item.unit,
          quantity: item.quantity,
          unit_value: item.unitPrice,
          total_value: item.quantity * item.unitPrice,
          ingredient_id: item.ingredientId,
          // O insumo é escolhido na mão, então já nasce vinculado — sem isso a
          // linha ficaria pendurada como "pendente de conciliação".
          match_status: "matched",
        })) as any,
      );

      // 3) Estoque e custo. Mesma regra da importação de nota: média ponderada
      //    pela quantidade que entrou.
      const movements: any[] = [];
      for (const item of items) {
        const { data: ing } = await supabase
          .from("pdv_ingredients")
          .select("current_stock, average_cost")
          .eq("id", item.ingredientId)
          .maybeSingle();

        const currentStock = Number(ing?.current_stock || 0);
        const currentAvg = Number(ing?.average_cost || 0) || item.unitPrice;
        const newStock = currentStock + item.quantity;
        const newAvg =
          newStock > 0
            ? (currentStock * currentAvg + item.quantity * item.unitPrice) / newStock
            : item.unitPrice;

        await supabase
          .from("pdv_ingredients")
          .update({
            current_stock: newStock,
            current_balance: newStock,
            unit_cost: item.unitPrice,
            average_cost: newAvg,
            real_cost: item.unitPrice,
            last_entry_date: dateOnly(input.purchaseDate),
          })
          .eq("id", item.ingredientId);

        movements.push({
          ingredient_id: item.ingredientId,
          type: "entrada",
          quantity: item.quantity,
          unit_cost: item.unitPrice,
          reason: `Compra avulsa${input.supplierName ? ` · ${input.supplierName}` : ""}`,
          created_by: user.id,
        });
      }

      if (movements.length) {
        const { error } = await supabase.from("pdv_stock_movements").insert(movements);
        if (error) console.warn("[compra-avulsa] movimentos:", error.message);
      }

      // 4) Memória do fornecedor por insumo: é o que faz a próxima compra já
      //    vir com o fornecedor sugerido preenchido.
      if (input.supplierId) {
        for (const item of items) {
          const { data: existing } = await supabase
            .from("pdv_ingredient_suppliers")
            .select("id")
            .eq("ingredient_id", item.ingredientId)
            .eq("supplier_id", input.supplierId)
            .maybeSingle();

          const payload = {
            last_price: item.unitPrice,
            last_purchase_date: dateOnly(input.purchaseDate),
          };

          if (existing?.id) {
            await supabase.from("pdv_ingredient_suppliers").update(payload).eq("id", existing.id);
          } else {
            await supabase.from("pdv_ingredient_suppliers").insert({
              ...payload,
              user_id: user.id,
              ingredient_id: item.ingredientId,
              supplier_id: input.supplierId,
              is_preferred: false,
            } as any);
          }
        }
      }

      toast.success("Compra lançada · estoque e financeiro atualizados.");
      return true;
    } catch (e: any) {
      console.error("[compra-avulsa]", e);
      toast.error(e?.message ?? "Não foi possível lançar a compra.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { save, saving };
}
