import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ShieldAlert,
  Loader2,
  Banknote,
  Smartphone,
  CreditCard,
  Ticket,
  ShieldCheck,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuthorizedEmployee } from "@/hooks/use-authorized-employees";
import type { CashierSession } from "@/hooks/use-pdv-cashier";
import { useEmployeeConsumption } from "@/hooks/use-employee-consumption";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: AuthorizedEmployee;
  activeSession: CashierSession | null;
}

const METHODS = [
  { key: "dinheiro", label: "Dinheiro", Icon: Banknote },
  { key: "pix", label: "PIX", Icon: Smartphone },
  { key: "credito", label: "Crédito", Icon: CreditCard },
  { key: "debito", label: "Débito", Icon: CreditCard },
  { key: "vale_refeicao", label: "Vale-refeição", Icon: Ticket },
] as const;

type Step = "auth" | "payment";

export function QuitarFiadoDialog({ open, onOpenChange, employee, activeSession }: Props) {
  const { settleConsumption } = useEmployeeConsumption();

  const [step, setStep] = useState<Step>("auth");
  const [password, setPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [authorizedBy, setAuthorizedBy] = useState("");

  const balance = employee.balance ?? 0;
  const [method, setMethod] = useState<string>("dinheiro");
  const [amountStr, setAmountStr] = useState("");

  useEffect(() => {
    if (open) {
      setStep("auth");
      setPassword("");
      setIsVerifying(false);
      setAuthorizedBy("");
      setMethod("dinheiro");
      setAmountStr(balance > 0 ? String(balance.toFixed(2)).replace(".", ",") : "");
    }
  }, [open, balance]);

  const handleAuth = async () => {
    if (!password) return;
    setIsVerifying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: users } = await supabase
        .from("establishment_users")
        .select("display_name,discount_password")
        .eq("establishment_owner_id", user?.id || "")
        .eq("is_active", true);

      const manager = (users || []).find((u: any) => u.discount_password === password);
      if (!manager) {
        toast.error("Senha incorreta");
        setPassword("");
        return;
      }
      setAuthorizedBy(manager.display_name || "Gerente");
      setStep("payment");
    } finally {
      setIsVerifying(false);
      setPassword("");
    }
  };

  const parseAmount = (s: string) => {
    const n = parseFloat(s.replace(",", "."));
    return isNaN(n) ? 0 : n;
  };

  const amount = parseAmount(amountStr);
  const change = method === "dinheiro" && amount > balance ? amount - balance : 0;

  const handleConfirm = async () => {
    if (!activeSession || amount <= 0) return;
    try {
      await settleConsumption.mutateAsync({
        employee_id: employee.id,
        amount,
        session_id: activeSession.id,
        payment_method: method,
      });
      onOpenChange(false);
    } catch {
      /* toast handled by mutation */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quitar fiado — {employee.full_name}</DialogTitle>
          <DialogDescription>
            {step === "auth"
              ? "Autorização obrigatória para registrar quitação."
              : `Saldo atual: ${formatBRL(balance)}`}
          </DialogDescription>
        </DialogHeader>

        {/* ETAPA 1 — SENHA */}
        {step === "auth" && (
          <div className="space-y-4 py-2">
            {!activeSession && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Caixa fechado. Abra o caixa para registrar quitações.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="quitar-pwd">Senha do gerente</Label>
              <div className="flex gap-2">
                <Input
                  id="quitar-pwd"
                  type="password"
                  inputMode="numeric"
                  placeholder="••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                  autoFocus
                  disabled={!activeSession}
                />
                <Button
                  onClick={handleAuth}
                  disabled={!password || isVerifying || !activeSession}
                >
                  {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Autorizar"}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            </DialogFooter>
          </div>
        )}

        {/* ETAPA 2 — PAGAMENTO */}
        {step === "payment" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
              <ShieldCheck className="h-4 w-4" />
              Autorizado por {authorizedBy}
            </div>

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMethod(key)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors",
                      method === key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quitar-amount">Valor</Label>
              <Input
                id="quitar-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
              {balance > 0 && (
                <p className="text-xs text-muted-foreground">
                  Saldo total: {formatBRL(balance)}
                  {amount < balance && amount > 0 && " (quitação parcial)"}
                </p>
              )}
            </div>

            {change > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm">
                Troco: <span className="font-bold">{formatBRL(change)}</span>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={amount <= 0 || !activeSession || settleConsumption.isPending}
              >
                {settleConsumption.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirmar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
