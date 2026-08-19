/**
 * Entrada de compra a partir de uma NF-e.
 *
 * Mesma espinha da compra avulsa — insumo já cadastrado, entrada de estoque,
 * gasto no financeiro — com o que a nota traz de verdade: fornecedor, valores
 * por item e, quando existe, o carnê de duplicatas do grupo <cobr>.
 *
 * Grava nos mesmos lugares da compra avulsa para o histórico ficar num só:
 * pdv_financial_transactions, pdv_invoices, pdv_invoice_items e
 * pdv_stock_movements.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateInvoice, useCreateInvoiceItems } from "@/hooks/use-pdv-invoices";
import { usePDVFinancialTransactions } from "@/hooks/use-pdv-financial-transactions";
import type { ParsedInvoice } from "@/lib/invoice/xml-parser";
import { toast } from "sonner";

export interface NfeEntryItem {
  /** Índice do item na nota, para casar com ParsedInvoice.items. */
  index: number;
  ingredientId: string | null;
  quantity: number;
  unitPrice: number;
}

export interface NfeEntryInput {
  nfe: ParsedInvoice;
  supplierId: string | null;
  items: NfeEntryItem[];
  chartAccountId: string | null;
  costCenterId: string | null;
  paymentMethod: string | null;
  /** Já foi paga no ato (comum em compra retirada no balcão). */
  paid: boolean;
  notes?: string;
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export function useNfeEntry() {
  const { user } = useAuth();
  const createInvoice = useCreateInvoice();
  const createInvoiceItems = useCreateInvoiceItems();
  const { createTransaction } = usePDVFinancialTransactions();
  const [saving, setSaving] = useState(false);

  const save = async (input: NfeEntryInput): Promise<boolean> => {
    if (!user) return false;
    const { nfe } = input;
    const vinculados = input.items.filter((i) => i.ingredientId && i.quantity > 0);

    setSaving(true);
    try {
      // 1) Financeiro. Com duplicatas na nota, uma conta a pagar por duplicata,
      //    com o vencimento que o fornecedor declarou. Sem elas, uma só.
      const duplicatas = nfe.payment?.duplicatas ?? [];
      const comum = {
        transaction_type: "payable" as const,
        supplier_id: input.supplierId,
        chart_account_id: input.chartAccountId,
        cost_center_id: input.costCenterId,
        payment_method: input.paymentMethod,
        document_number: nfe.invoiceKey,
        notes: input.notes || null,
      };
      const descricao = `NF-e ${nfe.invoiceNumber} · ${nfe.supplier.name}`;

      let primeiraId: string | undefined;
      let grupo: string | null = null;

      if (duplicatas.length > 1) {
        grupo = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
        for (let i = 0; i < duplicatas.length; i++) {
          const d = duplicatas[i];
          const criada = await createTransaction({
            ...comum,
            description: `${descricao} (${i + 1}/${duplicatas.length})`,
            amount: d.valor,
            due_date: d.vencimento,
            competence_date: nfe.emissionDate,
            status: "pending",
            group_id: grupo,
            installment_number: i + 1,
            installment_total: duplicatas.length,
          } as any);
          if (i === 0) primeiraId = (criada as any)?.id;
        }
      } else {
        const venc = duplicatas[0]?.vencimento ?? nfe.emissionDate;
        const criada = await createTransaction({
          ...comum,
          description: descricao,
          amount: nfe.totals.invoice,
          due_date: input.paid ? nfe.emissionDate : venc,
          competence_date: nfe.emissionDate,
          payment_date: input.paid ? nfe.emissionDate : null,
          status: input.paid ? "paid" : "pending",
        } as any);
        primeiraId = (criada as any)?.id;
      }

      // 2) Documento
      const invoice = await createInvoice.mutateAsync({
        invoice_number: nfe.invoiceNumber,
        invoice_key: nfe.invoiceKey,
        series: nfe.series || "",
        emission_date: nfe.emissionDate.toISOString(),
        entry_date: new Date().toISOString(),
        supplier_id: input.supplierId,
        supplier_cnpj: nfe.supplier.cnpj,
        supplier_name: nfe.supplier.name,
        total_products: nfe.totals.products,
        total_tax: nfe.totals.tax,
        total_invoice: nfe.totals.invoice,
        freight_value: nfe.totals.freight ?? 0,
        insurance_value: nfe.totals.insurance ?? 0,
        other_expenses: nfe.totals.otherExpenses ?? 0,
        discount_value: nfe.totals.discount ?? 0,
        operation_type: "entrada",
        invoice_type: "compra",
        status: "imported",
        financial_transaction_id: primeiraId ?? null,
        notes: input.notes || null,
      } as any);

      // Todas as parcelas apontam para a nota, não só a primeira.
      if (invoice?.id) {
        const alvo = supabase.from("pdv_financial_transactions").update({ invoice_id: invoice.id });
        const { error } = grupo
          ? await alvo.eq("group_id", grupo)
          : await alvo.eq("id", primeiraId ?? "");
        if (error) console.warn("[entrada-nfe] vínculo com a nota:", error.message);
      }

      // 3) Itens da nota, vinculados ou não. O item sem insumo continua
      //    registrado — some do estoque, não do documento.
      await createInvoiceItems.mutateAsync(
        nfe.items.map((item, idx) => {
          const escolha = input.items.find((i) => i.index === idx);
          return {
            invoice_id: invoice.id,
            item_number: item.itemNumber,
            product_code: item.productCode || null,
            product_ean: item.productEan || null,
            product_name: item.productName,
            ncm: item.ncm || null,
            cfop: item.cfop || null,
            unit: item.unit,
            quantity: item.quantity,
            unit_value: item.unitValue,
            total_value: item.totalValue,
            ingredient_id: escolha?.ingredientId ?? null,
            match_status: escolha?.ingredientId ? "matched" : "pending",
          };
        }) as any,
      );

      // 4) Estoque e custo médio ponderado
      const movements: any[] = [];
      for (const item of vinculados) {
        const { data: ing } = await supabase
          .from("pdv_ingredients")
          .select("current_stock, average_cost")
          .eq("id", item.ingredientId!)
          .maybeSingle();

        const atual = Number(ing?.current_stock || 0);
        const mediaAtual = Number(ing?.average_cost || 0) || item.unitPrice;
        const novo = atual + item.quantity;
        const novaMedia =
          novo > 0 ? (atual * mediaAtual + item.quantity * item.unitPrice) / novo : item.unitPrice;

        await supabase
          .from("pdv_ingredients")
          .update({
            current_stock: novo,
            current_balance: novo,
            unit_cost: item.unitPrice,
            average_cost: novaMedia,
            real_cost: item.unitPrice,
            last_entry_date: dateOnly(new Date()),
          })
          .eq("id", item.ingredientId!);

        movements.push({
          ingredient_id: item.ingredientId,
          type: "entrada",
          quantity: item.quantity,
          unit_cost: item.unitPrice,
          reason: `NF-e ${nfe.invoiceNumber} · ${nfe.supplier.name}`,
          created_by: user.id,
        });
      }

      if (movements.length) {
        const { error } = await supabase.from("pdv_stock_movements").insert(movements);
        if (error) console.warn("[entrada-nfe] movimentos:", error.message);
      }

      // 5) Memória do vínculo item da nota → insumo, para a próxima nota do
      //    mesmo fornecedor já vir preenchida.
      if (input.supplierId) {
        for (const item of vinculados) {
          await supabase.from("pdv_ingredient_suppliers").upsert(
            {
              ingredient_id: item.ingredientId,
              supplier_id: input.supplierId,
              is_preferred: false,
              last_price: item.unitPrice,
            } as any,
            { onConflict: "ingredient_id,supplier_id" },
          );
        }
      }

      toast.success(
        duplicatas.length > 1
          ? `Entrada feita · ${duplicatas.length} parcelas criadas em Lançamentos.`
          : "Entrada feita · estoque e Lançamentos atualizados.",
      );
      return true;
    } catch (e: any) {
      console.error("[entrada-nfe]", e);
      toast.error(e?.message ?? "Não foi possível dar entrada nesta nota.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { save, saving };
}
