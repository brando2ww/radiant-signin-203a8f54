import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Search, UserCheck } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAuthorizedEmployees } from "@/hooks/use-authorized-employees";

export type CreditSaleAuthPayload = {
  employee_id: string;
  employee_name: string;
  justification: string | null;
  authorized_by: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  isProcessing?: boolean;
  onConfirm: (payload: CreditSaleAuthPayload) => Promise<void> | void;
}

export function CreditSaleAuthDialog({
  open,
  onOpenChange,
  total,
  isProcessing,
  onConfirm,
}: Props) {
  const { user } = useAuth();
  const { employees } = useAuthorizedEmployees();

  const [employeeId, setEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [authorizedBy, setAuthorizedBy] = useState("");
  const [justification, setJustification] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployeeId("");
      setSearch("");
      setPassword("");
      setAuthorized(false);
      setAuthorizedBy("");
      setJustification("");
    }
  }, [open]);

  const selected = useMemo(
    () => employees.find((e) => e.id === employeeId) || null,
    [employees, employeeId],
  );
  const currentDebt = selected?.balance || 0;
  const newDebt = currentDebt + total;
  const overLimit =
    !!selected && selected.credit_limit > 0 && newDebt > selected.credit_limit;
  const needsJustification = overLimit && justification.trim().length < 10;

  const verifyPassword = async () => {
    if (!password) {
      toast.error("Digite a senha");
      return;
    }
    setVerifying(true);
    try {
      const { data: users, error } = await supabase
        .from("establishment_users")
        .select("display_name, discount_password")
        .eq("establishment_owner_id", user?.id || "")
        .eq("is_active", true);

      if (error) {
        toast.error("Erro ao verificar senha");
        return;
      }
      const authorizer = (users || []).find(
        (u: any) => u.discount_password === password,
      );
      if (!authorizer) {
        toast.error("Senha incorreta");
        setPassword("");
        return;
      }
      setAuthorized(true);
      setAuthorizedBy(authorizer.display_name || "Operador");
      toast.success(`Autorizado por ${authorizer.display_name || "operador"}`);
    } finally {
      setVerifying(false);
    }
  };

  const canConfirm =
    !!selected && authorized && !needsJustification && total > 0 && !isProcessing;

  const handleConfirm = async () => {
    if (!canConfirm || !selected) return;
    await onConfirm({
      employee_id: selected.id,
      employee_name: selected.full_name,
      justification: overLimit ? justification.trim() : null,
      authorized_by: authorizedBy,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Venda a Prazo
          </DialogTitle>
          <DialogDescription>
            Selecione o cliente e autorize com a senha do operador para lançar{" "}
            <span className="font-semibold text-foreground">{formatBRL(total)}</span>{" "}
            como saldo devedor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente cadastrado..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-[180px] border rounded-md">
              <div className="p-1">
                {employees
                  .filter((e) => e.is_active)
                  .filter(
                    (e) =>
                      !search ||
                      e.full_name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .slice(0, 50)
                  .map((emp) => {
                    const isSel = emp.id === employeeId;
                    const debt = emp.balance || 0;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => setEmployeeId(emp.id)}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors",
                          isSel ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{emp.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Saldo devedor: {formatBRL(debt)}
                            {emp.credit_limit > 0 &&
                              ` · Limite ${formatBRL(emp.credit_limit)}`}
                          </p>
                        </div>
                        {isSel && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                {employees.filter((e) => e.is_active).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum cliente cadastrado em Venda a Prazo.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {selected && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo atual</span>
                <span className="tabular-nums">{formatBRL(currentDebt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Esta venda</span>
                <span className="tabular-nums">{formatBRL(total)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between font-semibold">
                <span>Novo saldo</span>
                <span
                  className={cn(
                    "tabular-nums",
                    overLimit && "text-destructive",
                  )}
                >
                  {formatBRL(newDebt)}
                </span>
              </div>
              {selected.credit_limit > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Limite</span>
                  <span className="tabular-nums">
                    {formatBRL(selected.credit_limit)}
                  </span>
                </div>
              )}
            </div>
          )}

          {overLimit && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <strong>Limite excedido</strong> — informe uma justificativa
                  para autorizar a venda a prazo acima do limite.
                </div>
              </div>
              <Textarea
                placeholder="Justificativa (mín. 10 caracteres)"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Senha do operador autorizado</Label>
            <div className="flex gap-1">
              <Input
                type="password"
                inputMode="numeric"
                placeholder="Digite a senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={authorized || !selected}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !authorized && selected) {
                    e.preventDefault();
                    verifyPassword();
                  }
                }}
                className="h-9 text-sm flex-1"
              />
              <Button
                type="button"
                variant={authorized ? "default" : "outline"}
                size="sm"
                className="shrink-0 h-9 px-3 text-xs"
                disabled={authorized || !selected || verifying}
                onClick={verifyPassword}
              >
                {authorized ? "✓" : "OK"}
              </Button>
            </div>
            {authorized && authorizedBy && (
              <p className="text-xs text-emerald-600">Por: {authorizedBy}</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            {isProcessing ? "Lançando..." : "Confirmar Venda a Prazo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
