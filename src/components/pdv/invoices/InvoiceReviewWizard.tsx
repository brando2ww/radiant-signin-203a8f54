import { useState, useEffect, useMemo } from "react";
import { parseISO } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ParsedInvoice } from "@/lib/invoice/xml-parser";
import { EditableInvoiceData, EditableInvoiceItem, parseInvoiceToEditable } from "@/types/invoice";
import { Step1InvoiceData } from "./review-steps/Step1InvoiceData";
import { Step2SupplierData } from "./review-steps/Step2SupplierData";
import { Step3FinancialData } from "./review-steps/Step3FinancialData";
import { Step4ProductsData } from "./review-steps/Step4ProductsData";
import { Step5FinalReview } from "./review-steps/Step5FinalReview";
import { useCreateSupplier } from "@/hooks/use-pdv-suppliers";
import { useCreateInvoice, useCreateInvoiceItems } from "@/hooks/use-pdv-invoices";
import { usePDVFinancialTransactions } from "@/hooks/use-pdv-financial-transactions";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { useInvoiceItemLinks, upsertInvoiceItemLinks } from "@/hooks/use-invoice-item-links";
import { matchInvoiceItem } from "@/lib/invoice/match-ingredients";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface InvoiceReviewWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ParsedInvoice | null;
  initialEditableData?: EditableInvoiceData | null;
}

const STEPS = [
  { id: 1, title: "Dados da Nota" },
  { id: 2, title: "Fornecedor" },
  { id: 3, title: "Financeiro" },
  { id: 4, title: "Produtos" },
  { id: 5, title: "Revisão Final" },
];

export function InvoiceReviewWizard({
  open,
  onOpenChange,
  invoice,
  initialEditableData,
}: InvoiceReviewWizardProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [editableData, setEditableData] = useState<EditableInvoiceData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAutoMatched, setHasAutoMatched] = useState(false);

  const createSupplier = useCreateSupplier();
  const createInvoice = useCreateInvoice();
  const createInvoiceItems = useCreateInvoiceItems();
  const { createTransaction } = usePDVFinancialTransactions();
  const { ingredients } = usePDVIngredients();

  // Learned links for the current supplier (by id when existing, by CNPJ otherwise)
  const supplierIdForLinks =
    editableData?.supplier.mode === "existing" ? editableData.supplier.existingId : undefined;
  const supplierCnpjForLinks =
    editableData?.supplier.mode === "new"
      ? editableData.supplier.newData?.cnpj
      : undefined;
  const { links: learnedLinks } = useInvoiceItemLinks(supplierIdForLinks, supplierCnpjForLinks);

  // Initialize editable data when invoice or initialEditableData changes
  useEffect(() => {
    if (!open) return;

    if (initialEditableData) {
      setEditableData(initialEditableData);
      setCurrentStep(1);
      setHasAutoMatched(true); // viewing existing, no need to rematch
    } else if (invoice) {
      setEditableData(parseInvoiceToEditable(invoice));
      setCurrentStep(1);
      setHasAutoMatched(false);
    }
  }, [invoice, initialEditableData, open]);

  // Run automatic matching once ingredients + learned links are loaded
  useEffect(() => {
    if (!editableData || hasAutoMatched) return;
    if (!ingredients) return;

    const matchedItems: EditableInvoiceItem[] = editableData.items.map((item) => {
      const match = matchInvoiceItem(item, ingredients, learnedLinks);
      const candidateIds = match.candidates.map((c) => c.ingredient.id);

      if (match.confidence === "auto" && match.best) {
        return {
          ...item,
          linkAction: { type: "link", ingredientId: match.best.id },
          suggestedIngredientIds: candidateIds,
          autoMatched: true,
        };
      }
      // suggest or none — leave as 'none' but expose suggestions to UI
      return {
        ...item,
        linkAction: { type: "none" },
        suggestedIngredientIds: candidateIds,
        autoMatched: false,
      };
    });

    setEditableData({ ...editableData, items: matchedItems });
    setHasAutoMatched(true);

    const autoCount = matchedItems.filter((i) => i.autoMatched).length;
    const suggestCount = matchedItems.filter(
      (i) => !i.autoMatched && (i.suggestedIngredientIds?.length ?? 0) > 0
    ).length;
    if (autoCount > 0 || suggestCount > 0) {
      toast.success(
        `Análise automática: ${autoCount} vinculado(s), ${suggestCount} sugestão(ões)`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableData?.items.length, ingredients, learnedLinks, hasAutoMatched]);

  const blockingCount = useMemo(
    () => (editableData?.items.filter((i) => i.linkAction.type === "none").length ?? 0),
    [editableData]
  );

  const handleUpdate = (updates: Partial<EditableInvoiceData>) => {
    if (editableData) {
      setEditableData({ ...editableData, ...updates });
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) setCurrentStep(currentStep + 1);
  };

  const handlePrevious = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleConfirm = async () => {
    if (!editableData || !user) return;

    if (blockingCount > 0) {
      toast.error(`${blockingCount} item(ns) sem vinculação. Vincule ou marque para criar antes de confirmar.`);
      setCurrentStep(4);
      return;
    }

    setIsSubmitting(true);
    try {
      // 1) Supplier
      let supplierId = editableData.supplier.existingId;

      if (editableData.supplier.mode === "new" && editableData.supplier.newData) {
        const newSupplier = await createSupplier.mutateAsync({
          name: editableData.supplier.newData.name,
          company_name: editableData.supplier.newData.company_name || null,
          cnpj: editableData.supplier.newData.cnpj || null,
          state_registration: editableData.supplier.newData.state_registration || null,
          phone: editableData.supplier.newData.phone || null,
          email: editableData.supplier.newData.email || null,
          address: editableData.supplier.newData.address || null,
          city: editableData.supplier.newData.city || null,
          state: editableData.supplier.newData.state || null,
          zip_code: editableData.supplier.newData.zip_code || null,
          is_active: true,
        });
        supplierId = newSupplier.id;
      }
      if (!supplierId) throw new Error("Fornecedor não selecionado");

      // 2) Create new ingredients (sync, capture ids)
      const itemIngredientIds: (string | null)[] = new Array(editableData.items.length).fill(null);

      for (let i = 0; i < editableData.items.length; i++) {
        const item = editableData.items[i];
        if (item.linkAction.type === "create" && item.linkAction.newIngredientData) {
          const d = item.linkAction.newIngredientData;
          const { data: ing, error } = await supabase
            .from("pdv_ingredients")
            .insert({
              user_id: user.id,
              name: d.name,
              code: d.code || null,
              ean: d.ean || null,
              unit: d.unit,
              current_stock: 0, // entry will add the bought quantity
              min_stock: d.min_stock || 0,
              unit_cost: d.unit_cost,
              supplier_id: supplierId,
              category: d.category_id || null,
              loss_percentage: 0,
              selling_price: 0,
              icms_rate: 0,
              origin: "nacional",
              automatic_output: "none",
              max_stock: 0,
              real_cost: d.unit_cost,
              average_cost: d.unit_cost,
              ean_quantity: 1,
              purchase_lot: 1,
              current_balance: 0,
            })
            .select()
            .single();
          if (error) throw error;
          itemIngredientIds[i] = ing.id;
        } else if (item.linkAction.type === "link" && item.linkAction.ingredientId) {
          itemIngredientIds[i] = item.linkAction.ingredientId;
        }
      }

      // 3) Contas a pagar da nota
      //
      // Passa pelo mesmo caminho de parcelamento dos lançamentos manuais, em vez
      // de um laço próprio: assim as parcelas nascem com group_id e podem ser
      // editadas em conjunto, o arredondamento sobra na última (a soma bate com
      // o total da nota) e cada uma cai no seu mês na DRE.
      const installments = editableData.financial.installments;

      // A conta contábil vem do padrão do fornecedor. Sem isso o lançamento
      // nasce sem classificação e cai em "Sem classificação" na DRE — que é
      // exatamente onde as notas importadas estavam parando.
      let contaPadrao: string | null = null;
      let centroPadrao: string | null = null;
      if (supplierId) {
        const { data: forn } = await supabase
          .from("pdv_suppliers")
          .select("default_chart_account_id, default_cost_center_id")
          .eq("id", supplierId)
          .maybeSingle();
        contaPadrao = forn?.default_chart_account_id ?? null;
        centroPadrao = forn?.default_cost_center_id ?? null;
      }

      const comum = {
        transaction_type: "payable" as const,
        supplier_id: supplierId,
        chart_account_id: contaPadrao,
        cost_center_id: centroPadrao,
        payment_method: editableData.financial.payment_method || null,
        document_number: editableData.invoiceKey,
        notes: editableData.financial.notes || null,
      };

      const duplicatas = editableData.financial.duplicatas ?? [];
      let firstTransactionId: string | undefined;
      let grupoParcelas: string | null = null;

      if (duplicatas.length > 1) {
        // A nota trouxe o carnê: cada parcela nasce com o vencimento e o valor
        // que o fornecedor declarou. Espaçar de mês em mês seria inventar datas
        // que já existem no documento.
        grupoParcelas = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
        const criadas = [];
        for (let i = 0; i < duplicatas.length; i++) {
          const d = duplicatas[i];
          criadas.push(
            await createTransaction({
              ...comum,
              description: `${editableData.financial.description} (${i + 1}/${duplicatas.length})`,
              amount: d.valor,
              due_date: d.vencimento,
              competence_date: editableData.emissionDate,
              status: "pending",
              group_id: grupoParcelas,
              installment_number: i + 1,
              installment_total: duplicatas.length,
            } as any),
          );
        }
        firstTransactionId = (criadas[0] as any)?.id;
      } else {
        const primeira = await createTransaction({
          ...comum,
          description: editableData.financial.description,
          amount: editableData.financial.amount,
          due_date: editableData.financial.due_date,
          payment_date: editableData.financial.payment_date || null,
          status: editableData.financial.status,
          ...(installments > 1
            ? { repeat_mode: "installments", installment_total: installments, installment_amount_is_total: true }
            : {}),
        } as any);
        firstTransactionId = (primeira as any)?.id;
        grupoParcelas = (primeira as any)?.group_id ?? null;
      }

      // 4) Invoice header
      const invoiceRecord = await createInvoice.mutateAsync({
        invoice_number: editableData.invoiceNumber,
        invoice_key: editableData.invoiceKey,
        series: editableData.series,
        emission_date: editableData.emissionDate.toISOString(),
        entry_date: editableData.entryDate.toISOString(),
        supplier_id: supplierId,
        supplier_cnpj: editableData.supplier.newData?.cnpj || "",
        supplier_name: editableData.supplier.newData?.name || "",
        total_products: editableData.totals.products,
        total_tax: editableData.totals.tax,
        total_invoice: editableData.totals.invoice,
        freight_value: editableData.totals.freight,
        insurance_value: editableData.totals.insurance,
        other_expenses: editableData.totals.otherExpenses,
        discount_value: editableData.totals.discount,
        operation_type: editableData.operationType,
        invoice_type: "compra",
        status: "imported",
        financial_transaction_id: firstTransactionId,
        notes: editableData.notes || null,
      });

      // 4b) Liga TODAS as parcelas à nota, e não só a primeira. Uma nota tem
      // muitas parcelas; sem isso, da segunda em diante ninguém sabia de onde
      // o lançamento veio.
      if (invoiceRecord?.id) {
        const alvo = supabase
          .from("pdv_financial_transactions")
          .update({ invoice_id: invoiceRecord.id });
        const { error: linkErr } = grupoParcelas
          ? await alvo.eq("group_id", grupoParcelas)
          : await alvo.eq("id", firstTransactionId);
        if (linkErr) console.error("[nota] falha ao ligar parcelas à nota", linkErr);
      }

      // 5) Invoice items
      const itemsToInsert = editableData.items.map((item, idx) => ({
        invoice_id: invoiceRecord.id,
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
        discount_value: item.discountValue || null,
        freight_value: item.freightValue || null,
        insurance_value: item.insuranceValue || null,
        other_expenses: item.otherExpenses || null,
        icms_value: item.taxes.icms || null,
        ipi_value: item.taxes.ipi || null,
        pis_value: item.taxes.pis || null,
        cofins_value: item.taxes.cofins || null,
        ingredient_id: itemIngredientIds[idx],
        match_status: itemIngredientIds[idx] ? "matched" : "unmatched",
      }));
      // Remove itens anteriores desta nota (reimportação de nota MDe já existente)
      // para não duplicar.
      await supabase.from("pdv_invoice_items").delete().eq("invoice_id", invoiceRecord.id);
      await createInvoiceItems.mutateAsync(itemsToInsert);

      // 6) Stock entry: update ingredient + create stock movement
      const stockMovementsRows: any[] = [];
      for (let i = 0; i < editableData.items.length; i++) {
        const item = editableData.items[i];
        const ingId = itemIngredientIds[i];
        if (!ingId) continue;
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;

        // Read current stock + average
        const { data: ing, error: readErr } = await supabase
          .from("pdv_ingredients")
          .select("current_stock, average_cost")
          .eq("id", ingId)
          .maybeSingle();
        if (readErr) {
          console.warn("[invoice-import] erro lendo insumo:", readErr.message);
          continue;
        }

        const currentStock = Number(ing?.current_stock || 0);
        const currentAvg = Number(ing?.average_cost || 0) || Number(item.unitValue) || 0;
        const newStock = currentStock + qty;
        const newAvg =
          newStock > 0
            ? (currentStock * currentAvg + qty * Number(item.unitValue)) / newStock
            : Number(item.unitValue);

        await supabase
          .from("pdv_ingredients")
          .update({
            current_stock: newStock,
            current_balance: newStock,
            unit_cost: item.unitValue,
            average_cost: newAvg,
            real_cost: item.unitValue,
            last_entry_date: editableData.entryDate.toISOString().slice(0, 10),
          })
          .eq("id", ingId);

        stockMovementsRows.push({
          ingredient_id: ingId,
          type: "entrada",
          quantity: qty,
          unit_cost: Number(item.unitValue) || null,
          reason: `Entrada NF-e nº ${editableData.invoiceNumber} (item ${item.itemNumber})`,
          created_by: user.id,
        });
      }

      if (stockMovementsRows.length > 0) {
        const { error: smErr } = await supabase
          .from("pdv_stock_movements")
          .insert(stockMovementsRows);
        if (smErr) console.warn("[invoice-import] erro nos movimentos:", smErr.message);
      }

      // 7) Persist learned links (for future imports of same supplier)
      const learnRows = editableData.items
        .map((item, idx) => ({
          supplier_id: supplierId!,
          supplier_cnpj: editableData.supplier.newData?.cnpj || null,
          product_code: item.productCode || null,
          product_ean: item.productEan || null,
          ingredient_id: itemIngredientIds[idx] || "",
        }))
        .filter((r) => r.ingredient_id);
      await upsertInvoiceItemLinks(user.id, learnRows);

      toast.success("Nota fiscal importada e estoque atualizado!");
      onOpenChange(false);
      setCurrentStep(1);
      setEditableData(null);
      setHasAutoMatched(false);
    } catch (error: any) {
      console.error("Erro ao importar nota:", error);
      toast.error("Erro ao importar nota fiscal: " + (error?.message || "desconhecido"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setEditableData(null);
      setCurrentStep(1);
      setIsSubmitting(false);
      setHasAutoMatched(false);
    }
  };

  const progress = (currentStep / STEPS.length) * 100;

  if (!editableData) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[800px]">
          <div className="flex items-center justify-center p-8">
            <p className="text-muted-foreground">Carregando dados da nota fiscal...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isLastStep = currentStep === STEPS.length;
  const confirmDisabled = isSubmitting || blockingCount > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Nota Fiscal - {STEPS[currentStep - 1].title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((step) => (
              <div
                key={step.id}
                className={`${step.id === currentStep ? "font-semibold text-foreground" : ""} ${
                  step.id < currentStep ? "text-primary" : ""
                }`}
              >
                {step.id}. {step.title}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1">
          {currentStep === 1 && <Step1InvoiceData data={editableData} onUpdate={handleUpdate} />}
          {currentStep === 2 && <Step2SupplierData data={editableData} onUpdate={handleUpdate} />}
          {currentStep === 3 && <Step3FinancialData data={editableData} onUpdate={handleUpdate} />}
          {currentStep === 4 && <Step4ProductsData data={editableData} onUpdate={handleUpdate} />}
          {currentStep === 5 && <Step5FinalReview data={editableData} />}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1 || isSubmitting}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Anterior
          </Button>

          <div className="flex items-center gap-3">
            {blockingCount > 0 && isLastStep && (
              <span className="text-xs text-destructive">
                {blockingCount} item(ns) sem vinculação
              </span>
            )}
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            {!isLastStep ? (
              <Button onClick={handleNext} disabled={isSubmitting}>
                Próximo
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleConfirm} disabled={confirmDisabled}>
                {isSubmitting ? "Importando..." : "Confirmar Importação"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
