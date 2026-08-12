/**
 * Compra avulsa em 3 passos: itens e pagamento · fornecedor · revisão.
 *
 * O caso de uso é "voltei do mercado com a mercadoria", então tudo que dá para
 * assumir vem preenchido: data de hoje, compra já paga, fornecedor sugerido a
 * partir do histórico do insumo. No melhor caso é escolher os itens e clicar
 * duas vezes em Próximo.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { IngredientCombobox } from "@/components/pdv/purchases/IngredientCombobox";
import { FilterCombobox } from "@/components/pdv/purchases/reports/FilterCombobox";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { usePDVSuppliers, useCreateSupplier } from "@/hooks/use-pdv-suppliers";
import { supabase } from "@/integrations/supabase/client";
import { useQuickPurchase, type QuickPurchaseItem } from "@/hooks/use-quick-purchase";
import { formatBRL } from "@/lib/format";
import { dateOnly } from "@/lib/purchase-reports/dates";

const STEPS = ["Itens e pagamento", "Fornecedor", "Revisão"];

const PAYMENT_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Cartão de débito" },
  { value: "credito", label: "Cartão de crédito" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
];

type Row = { ingredientId: string; quantity: string; unitPrice: string };

const emptyRow = (): Row => ({ ingredientId: "", quantity: "1", unitPrice: "" });

export function QuickPurchaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { ingredients } = usePDVIngredients();
  const { suppliers } = usePDVSuppliers();
  const createSupplier = useCreateSupplier();
  const { save, saving } = useQuickPurchase();

  const [step, setStep] = useState(1);
  const [purchaseDate, setPurchaseDate] = useState(() => dateOnly(new Date()));
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [paid, setPaid] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [dueDate, setDueDate] = useState(() => dateOnly(new Date()));
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [suggestedId, setSuggestedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPurchaseDate(dateOnly(new Date()));
    setRows([emptyRow()]);
    setPaid(true);
    setPaymentMethod("pix");
    setSupplierId("");
    setNewSupplierName("");
    setSuggestedId(null);
  }, [open]);

  const ingMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const items: QuickPurchaseItem[] = useMemo(
    () =>
      rows
        .filter((r) => r.ingredientId)
        .map((r) => {
          const ing = ingMap.get(r.ingredientId);
          return {
            ingredientId: r.ingredientId,
            ingredientName: ing?.name ?? "Insumo",
            unit: ing?.unit ?? "un",
            quantity: parseFloat(r.quantity.replace(",", ".")) || 0,
            unitPrice: parseFloat(r.unitPrice || "0") || 0,
          };
        }),
    [rows, ingMap],
  );

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  /**
   * Fornecedor sugerido: o que já vendeu esses insumos antes. Busca só quando
   * chega no passo 2, para não pesar o passo 1.
   */
  useEffect(() => {
    if (step !== 2 || !items.length || supplierId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("pdv_ingredient_suppliers")
        .select("supplier_id, is_preferred, last_purchase_date")
        .in("ingredient_id", items.map((i) => i.ingredientId));

      if (cancelled || !data?.length) return;
      // Mais votos entre os insumos da compra; empate desempata pelo preferido.
      const score = new Map<string, number>();
      for (const row of data as any[]) {
        score.set(row.supplier_id, (score.get(row.supplier_id) ?? 0) + (row.is_preferred ? 1.5 : 1));
      }
      const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (best) {
        setSupplierId(best);
        setSuggestedId(best);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, items, supplierId]);

  const supplierName =
    suppliers.find((s) => s.id === supplierId)?.name || newSupplierName.trim();

  const updateRow = (index: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const handleNext = () => {
    if (step === 1) {
      if (!items.length) return toast.error("Escolha ao menos um insumo.");
      if (items.some((i) => i.quantity <= 0)) return toast.error("Informe a quantidade de cada item.");
      if (items.some((i) => i.unitPrice <= 0)) return toast.error("Informe o valor de cada item.");
    }
    setStep((s) => Math.min(STEPS.length, s + 1));
  };

  const handleConfirm = async () => {
    let finalSupplierId = supplierId || null;
    if (!finalSupplierId && newSupplierName.trim()) {
      const created = await createSupplier.mutateAsync({
        name: newSupplierName.trim(),
        is_active: true,
      } as any);
      finalSupplierId = created?.id ?? null;
    }

    const ok = await save({
      purchaseDate: new Date(`${purchaseDate}T12:00:00`),
      items,
      supplierId: finalSupplierId,
      supplierName: supplierName,
      paid,
      paymentMethod,
      dueDate: new Date(`${dueDate}T12:00:00`),
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Compra avulsa · {STEPS[step - 1]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Progress value={(step / STEPS.length) * 100} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((s, i) => (
              <span key={s} className={i + 1 === step ? "font-semibold text-foreground" : ""}>
                {i + 1}. {s}
              </span>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
          {step === 1 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data da compra</Label>
                  <Input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Itens</Label>
                {rows.map((row, index) => {
                  const ing = ingMap.get(row.ingredientId);
                  const line =
                    (parseFloat(row.quantity.replace(",", ".")) || 0) *
                    (parseFloat(row.unitPrice || "0") || 0);
                  return (
                    <div key={index} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          {/* Só insumo já cadastrado, de propósito: criar insumo
                              na pressa da entrada é como o catálogo vira lixo. */}
                          <IngredientCombobox
                            ingredients={ingredients.map((i) => ({
                              id: i.id,
                              name: i.name,
                              unit: i.unit ?? undefined,
                            }))}
                            value={row.ingredientId}
                            onChange={(id) => updateRow(index, { ingredientId: id })}
                          />
                        </div>
                        {rows.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="mt-0.5 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setRows((rs) => rs.filter((_, i) => i !== index))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Quantidade {ing?.unit ? `(${ing.unit})` : ""}
                          </Label>
                          <Input
                            inputMode="decimal"
                            value={row.quantity}
                            onChange={(e) => updateRow(index, { quantity: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Valor unitário
                          </Label>
                          <CurrencyInput
                            value={row.unitPrice}
                            onChange={(v) => updateRow(index, { unitPrice: v })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Subtotal</Label>
                          <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                            {formatBRL(line)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <Button
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => setRows((rs) => [...rs, emptyRow()])}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar item
                </Button>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Pagamento</Label>
                  <span className="text-sm">
                    Total: <strong>{formatBRL(total)}</strong>
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { v: true, l: "Já paguei" },
                    { v: false, l: "A pagar" },
                  ].map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setPaid(opt.v)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        paid === opt.v
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Forma de pagamento</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!paid && (
                    <div className="space-y-1">
                      <Label className="text-xs">Vencimento</Label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {suggestedId && supplierId === suggestedId && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Fornecedor sugerido pelo histórico</p>
                    <p className="text-xs">
                      É de quem você já comprou esses insumos antes. Troque se não for o caso.
                    </p>
                  </div>
                </div>
              )}

              <FilterCombobox
                label="Fornecedor"
                value={supplierId}
                allLabel="Sem fornecedor / não informar"
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(v) => {
                  setSupplierId(v);
                  if (v) setNewSupplierName("");
                }}
                width="w-full"
              />

              {!supplierId && (
                <div className="space-y-1">
                  <Label className="text-xs">Ou cadastre um novo</Label>
                  <Input
                    placeholder="Nome do fornecedor (ex: Atacadão)"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cadastro mínimo · os demais dados você completa depois em Fornecedores.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data</span>
                  <strong>{purchaseDate.split("-").reverse().join("/")}</strong>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Fornecedor</span>
                  <strong>{supplierName || "não informado"}</strong>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Pagamento</span>
                  <strong>
                    {paid ? "Pago" : "A pagar"} ·{" "}
                    {PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label}
                  </strong>
                </div>
              </div>

              <div className="rounded-lg border">
                {items.map((i) => (
                  <div
                    key={i.ingredientId}
                    className="flex items-center justify-between gap-2 border-b p-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.ingredientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.quantity.toLocaleString("pt-BR")} {i.unit} × {formatBRL(i.unitPrice)}
                      </p>
                    </div>
                    <strong>{formatBRL(i.quantity * i.unitPrice)}</strong>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                <span>Total</span>
                <strong className="text-lg">{formatBRL(total)}</strong>
              </div>

              <p className="text-xs text-muted-foreground">
                Ao confirmar: entra no estoque, recalcula o custo médio dos insumos e lança no
                financeiro como {paid ? "pago" : "conta a pagar"}.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || saving}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Anterior
          </Button>

          <div className="flex items-center gap-2">
            {step === 1 && items.length > 0 && (
              <Badge variant="secondary">{formatBRL(total)}</Badge>
            )}
            {step < STEPS.length ? (
              <Button onClick={handleNext}>
                Próximo
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? "Lançando..." : "Confirmar compra"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
