import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Search, ArrowLeft, Minus, Plus, AlertTriangle } from "lucide-react";
import { useAuthorizedEmployees, AuthorizedEmployee } from "@/hooks/use-authorized-employees";
import { useEmployeeConsumption } from "@/hooks/use-employee-consumption";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import { formatBRL } from "@/lib/format";

type Step = "mode" | "select-employee" | "products" | "settle" | "summary";
type Mode = "consume" | "settle";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cashierSessionId: string | null;
}

interface CartItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
}

export function EmployeeConsumptionFlowDialog({ open, onOpenChange, cashierSessionId }: Props) {
  const { employees } = useAuthorizedEmployees();
  const { products } = usePDVProducts();
  const { registerConsumption, isRegistering, settleConsumption, isSettling } =
    useEmployeeConsumption();

  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode>("consume");
  const [employee, setEmployee] = useState<AuthorizedEmployee | null>(null);
  const [empSearch, setEmpSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [justification, setJustification] = useState("");
  const [discount, setDiscount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("mode");
        setMode("consume");
        setEmployee(null);
        setEmpSearch("");
        setProdSearch("");
        setCart([]);
        setSettleAmount(0);
        setJustification("");
        setDiscount(0);
        setDiscountReason("");
        setCouponCode("");
        setNotes("");
      }, 200);
    }
  }, [open]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (mode === "consume" && !e.is_active) return false;
      if (mode === "settle" && (!e.balance || e.balance <= 0)) return false;
      if (empSearch && !e.full_name.toLowerCase().includes(empSearch.toLowerCase())) return false;
      return true;
    });
  }, [employees, mode, empSearch]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p) => p.is_available)
      .filter((p) =>
        !prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase()),
      )
      .slice(0, 50);
  }, [products, prodSearch]);

  const cartSubtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const effectiveDiscount = Math.min(Math.max(discount, 0), cartSubtotal);
  const cartTotal = Math.max(0, cartSubtotal - effectiveDiscount);

  const currentDebt = employee?.balance || 0;
  const newDebt = currentDebt + cartTotal;
  const overLimit =
    employee && employee.credit_limit > 0 && newDebt > employee.credit_limit;
  const discountReasonInvalid = effectiveDiscount > 0 && discountReason.trim().length < 3;

  const addProduct = (p: any) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.product_id === p.id);
      if (ex) {
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          unit_price: Number(p.price_salon) || 0,
          quantity: 1,
        },
      ];
    });
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product_id === id ? { ...i, quantity: i.quantity + delta } : i,
        )
        .filter((i) => i.quantity > 0),
    );
  };

  const handleConfirmConsume = () => {
    if (!employee || cart.length === 0) return;
    if (overLimit && justification.trim().length < 5) return;
    registerConsumption(
      {
        employee_id: employee.id,
        items: cart,
        justification: overLimit ? justification.trim() : undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleConfirmSettle = () => {
    if (!employee || settleAmount <= 0) return;
    settleConsumption(
      {
        employee_id: employee.id,
        amount: settleAmount,
        session_id: cashierSessionId,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const initialsOf = (name: string) =>
    name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step !== "mode" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  if (step === "select-employee") setStep("mode");
                  else if (step === "products" || step === "settle") setStep("select-employee");
                  else if (step === "summary") setStep(mode === "consume" ? "products" : "settle");
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle>Venda a Prazo</DialogTitle>
          </div>
          <DialogDescription>
            {step === "mode" && "Escolha uma operação."}
            {step === "select-employee" && "Selecione o cliente."}
            {step === "products" && "Adicione produtos à venda."}
            {step === "settle" && "Informe o valor da quitação."}
            {step === "summary" && "Confirme os dados."}
          </DialogDescription>
        </DialogHeader>

        {step === "mode" && (
          <div className="grid grid-cols-2 gap-3 py-6">
            <Button
              variant="outline"
              className="h-32 flex-col gap-2"
              onClick={() => { setMode("consume"); setStep("select-employee"); }}
            >
              <Plus className="h-6 w-6" />
              <span>Novo Lançamento</span>
            </Button>
            <Button
              variant="outline"
              className="h-32 flex-col gap-2"
              onClick={() => { setMode("settle"); setStep("select-employee"); }}
            >
              <Minus className="h-6 w-6" />
              <span>Quitar Saldo</span>
            </Button>
          </div>
        )}

        {step === "select-employee" && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-3">
                {filteredEmployees.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {mode === "settle"
                      ? "Nenhum cliente com saldo devedor."
                      : "Nenhum cliente ativo."}
                  </p>
                )}
                {filteredEmployees.map((emp) => (
                  <Card
                    key={emp.id}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => {
                      setEmployee(emp);
                      setStep(mode === "consume" ? "products" : "settle");
                    }}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <Avatar>
                        {emp.avatar_url && <AvatarImage src={emp.avatar_url} />}
                        <AvatarFallback>{initialsOf(emp.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{emp.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {emp.role_title || "Sem cargo"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Saldo</p>
                        <p className={`font-semibold ${(emp.balance || 0) > 0 ? "text-destructive" : ""}`}>
                          {formatBRL(emp.balance || 0)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === "products" && employee && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
            <div className="flex flex-col gap-2 min-h-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="flex-1 border rounded-md">
                <div className="divide-y">
                  {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      className="p-2 flex items-center justify-between hover:bg-accent cursor-pointer"
                      onClick={() => addProduct(p)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBRL(Number(p.price_salon) || 0)}</p>
                      </div>
                      <Plus className="h-4 w-4" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex flex-col gap-2 min-h-0">
              <p className="text-sm font-medium">Carrinho</p>
              <ScrollArea className="flex-1 border rounded-md">
                <div className="divide-y">
                  {cart.length === 0 && (
                    <p className="p-4 text-center text-xs text-muted-foreground">
                      Adicione produtos.
                    </p>
                  )}
                  {cart.map((i) => (
                    <div key={i.product_id} className="p-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{i.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBRL(i.unit_price)} x {i.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => changeQty(i.product_id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{i.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => changeQty(i.product_id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="border rounded-md p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Total consumo:</span><span className="font-medium">{formatBRL(cartTotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Saldo atual:</span><span>{formatBRL(currentDebt)}</span></div>
                <div className="flex justify-between font-semibold"><span>Novo saldo:</span><span className={overLimit ? "text-destructive" : ""}>{formatBRL(newDebt)}</span></div>
                {employee.credit_limit > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Limite:</span><span>{formatBRL(employee.credit_limit)}</span>
                  </div>
                )}
              </div>
              {overLimit && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-destructive text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    Limite excedido em {formatBRL(newDebt - employee.credit_limit)}
                  </div>
                  <Textarea
                    placeholder="Justificativa (mínimo 5 caracteres)"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
              <Button
                onClick={handleConfirmConsume}
                disabled={cart.length === 0 || isRegistering || (overLimit && justification.trim().length < 5)}
              >
                Confirmar lançamento
              </Button>
            </div>
          </div>
        )}

        {step === "settle" && employee && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <Avatar>
                  {employee.avatar_url && <AvatarImage src={employee.avatar_url} />}
                  <AvatarFallback>{initialsOf(employee.full_name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium">{employee.full_name}</p>
                  <p className="text-xs text-muted-foreground">Saldo devedor</p>
                </div>
                <p className="text-lg font-bold text-destructive">{formatBRL(currentDebt)}</p>
              </CardContent>
            </Card>

            <SettlementEntries employeeId={employee.id} />

            <div className="space-y-2">
              <p className="text-sm">Valor recebido</p>
              <CurrencyInput value={settleAmount} onChange={(v) => setSettleAmount(Number(v) || 0)} />
              {settleAmount > currentDebt && (
                <p className="text-xs text-muted-foreground">
                  Sobra de {formatBRL(settleAmount - currentDebt)} ficará como troco/crédito (não devolvido).
                </p>
              )}
            </div>

            {!cashierSessionId && (
              <p className="text-xs text-destructive">Caixa fechado — abra o caixa para quitar.</p>
            )}

            <Button
              onClick={handleConfirmSettle}
              disabled={settleAmount <= 0 || isSettling || !cashierSessionId}
            >
              Confirmar quitação
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettlementEntries({ employeeId }: { employeeId: string }) {
  const { entries } = useEmployeeConsumption(employeeId);
  const pending = entries.filter((e) => e.status !== "pago");
  if (pending.length === 0) return null;
  return (
    <ScrollArea className="max-h-[180px] border rounded-md">
      <div className="divide-y">
        {pending.map((e) => (
          <div key={e.id} className="p-2 flex justify-between text-sm">
            <div>
              <p>{new Date(e.created_at).toLocaleDateString("pt-BR")}</p>
              <p className="text-xs text-muted-foreground">
                {Array.isArray(e.items) ? e.items.length : 0} item(s)
              </p>
            </div>
            <div className="text-right">
              <p>{formatBRL(Number(e.total) - Number(e.paid_amount))}</p>
              {e.status === "pago_parcial" && (
                <Badge variant="outline" className="text-xs">Parcial</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
