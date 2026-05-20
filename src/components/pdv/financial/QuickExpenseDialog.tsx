import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CurrencyInput } from "@/components/ui/currency-input";
import { CalendarIcon, Plus, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { usePDVChartOfAccounts } from "@/hooks/use-pdv-chart-of-accounts";
import { usePDVCostCenters } from "@/hooks/use-pdv-cost-centers";
import { usePDVSuppliers } from "@/hooks/use-pdv-suppliers";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { useQuickExpense, type QuickExpenseStockItem } from "@/hooks/use-quick-expense";

interface QuickExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashierSessionId?: string | null;
}

const NONE = "none";

interface ItemRow extends QuickExpenseStockItem {
  _key: string;
}

function newRow(): ItemRow {
  return { _key: crypto.randomUUID(), ingredient_id: "", quantity: 0, unit_cost: 0 };
}

export function QuickExpenseDialog({ open, onOpenChange, cashierSessionId }: QuickExpenseDialogProps) {
  const { accounts } = usePDVChartOfAccounts();
  const { costCenters } = usePDVCostCenters();
  const { suppliers } = usePDVSuppliers();
  const { ingredients = [] } = usePDVIngredients();
  const mutation = useQuickExpense();

  const expenseAccounts = useMemo(
    () => (accounts || []).filter((a) => /despesa|custo/i.test(a.account_type)),
    [accounts],
  );
  const accountOptions = expenseAccounts.length > 0 ? expenseAccounts : (accounts || []);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [chartAccountId, setChartAccountId] = useState<string>(NONE);
  const [costCenterId, setCostCenterId] = useState<string>(NONE);
  const [paymentMethod, setPaymentMethod] = useState<string>(cashierSessionId ? "dinheiro" : NONE);
  const [supplierId, setSupplierId] = useState<string>(NONE);
  const [documentNumber, setDocumentNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [updateStock, setUpdateStock] = useState(false);
  const [updateCost, setUpdateCost] = useState(true);
  const [items, setItems] = useState<ItemRow[]>([newRow()]);

  useEffect(() => {
    if (!open) {
      setDescription("");
      setAmount("");
      setPaymentDate(new Date());
      setChartAccountId(NONE);
      setCostCenterId(NONE);
      setPaymentMethod(cashierSessionId ? "dinheiro" : NONE);
      setSupplierId(NONE);
      setDocumentNumber("");
      setNotes("");
      setUpdateStock(false);
      setUpdateCost(true);
      setItems([newRow()]);
    }
  }, [open]);

  const value = parseFloat(amount) || 0;
  const itemsTotal = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
  const diff = Math.abs(itemsTotal - value);

  const validItems = items.filter((i) => i.ingredient_id && i.quantity > 0 && i.unit_cost > 0);

  const canSubmit =
    description.trim().length > 0 &&
    value > 0 &&
    chartAccountId !== NONE &&
    (!updateStock || validItems.length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await mutation.mutateAsync({
      description: description.trim(),
      amount: value,
      payment_date: paymentDate,
      chart_account_id: chartAccountId,
      cost_center_id: costCenterId === NONE ? null : costCenterId,
      payment_method: paymentMethod === NONE ? null : paymentMethod,
      supplier_id: supplierId === NONE ? null : supplierId,
      document_number: documentNumber.trim() || null,
      notes: notes.trim() || null,
      update_stock: updateStock,
      update_cost: updateCost,
      items: updateStock ? validItems.map(({ _key, ...r }) => r) : [],
      cashier_session_id: cashierSessionId ?? null,
    });
    onOpenChange(false);
  };

  const updateItem = (key: string, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((i) => (i._key === key ? { ...i, ...patch } : i)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length === 1 ? [newRow()] : prev.filter((i) => i._key !== key)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Despesa rápida</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input
                placeholder="Ex: Mercado Atacadão, Conserto freezer"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Valor total *</Label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Data do pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(paymentDate, "PPP", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={paymentDate}
                    onSelect={(d) => d && setPaymentDate(d)}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Plano de contas *</Label>
              <Select value={chartAccountId} onValueChange={setChartAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} disabled>
                    Selecione a categoria
                  </SelectItem>
                  {accountOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Centro de custo</Label>
              <Select value={costCenterId} onValueChange={setCostCenterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {(costCenters || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informar</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="credito">Cartão de Crédito</SelectItem>
                  <SelectItem value="debito">Cartão de Débito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
              {cashierSessionId && paymentMethod === "dinheiro" && (
                <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  Será debitado do caixa atual como sangria automática.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {(suppliers || []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name || s.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nº do documento</Label>
              <Input
                placeholder="Cupom, NF, recibo..."
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="cursor-pointer" htmlFor="toggle-stock">
                  Dar entrada no estoque
                </Label>
                <p className="text-xs text-muted-foreground">
                  Útil para compras de mercado/insumos.
                </p>
              </div>
              <Switch id="toggle-stock" checked={updateStock} onCheckedChange={setUpdateStock} />
            </div>

            {updateStock && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="cursor-pointer text-xs flex items-center gap-2" htmlFor="toggle-cost">
                    <Switch id="toggle-cost" checked={updateCost} onCheckedChange={setUpdateCost} />
                    Atualizar custo unitário do ingrediente com o valor informado
                  </Label>
                </div>

                <div className="space-y-2">
                  {items.map((item) => {
                    const ing = ingredients.find((i) => i.id === item.ingredient_id);
                    const subtotal = (item.quantity || 0) * (item.unit_cost || 0);
                    return (
                      <div
                        key={item._key}
                        className="grid gap-2 md:grid-cols-[1fr_110px_60px_140px_140px_40px] items-end"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs">Ingrediente</Label>
                          <Select
                            value={item.ingredient_id || NONE}
                            onValueChange={(v) =>
                              updateItem(item._key, { ingredient_id: v === NONE ? "" : v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE} disabled>
                                Selecione
                              </SelectItem>
                              {ingredients.map((i) => (
                                <SelectItem key={i.id} value={i.id}>
                                  {i.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Quantidade</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.quantity || ""}
                            onChange={(e) =>
                              updateItem(item._key, { quantity: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Un.</Label>
                          <Input value={ing?.unit || "-"} disabled />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Custo unitário</Label>
                          <CurrencyInput
                            value={item.unit_cost ? String(item.unit_cost) : ""}
                            onChange={(v) =>
                              updateItem(item._key, { unit_cost: parseFloat(v) || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Subtotal</Label>
                          <Input value={formatBRL(subtotal)} disabled />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item._key)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems((p) => [...p, newRow()])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar item
                </Button>

                <div className="flex items-center justify-between text-sm border-t pt-2">
                  <span className="text-muted-foreground">Soma dos itens</span>
                  <span className="font-semibold tabular-nums">{formatBRL(itemsTotal)}</span>
                </div>
                {value > 0 && diff > 0.01 && (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                    <span>
                      Diferença de {formatBRL(diff)} entre o total da despesa e a soma dos itens
                      (ok para frete/imposto).
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Registrar despesa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
