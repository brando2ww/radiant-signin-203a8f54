import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/format";

interface CashMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddMovement: (type: "sangria" | "reforco", amount: number, description?: string) => void;
  isAdding: boolean;
  defaultType?: "sangria" | "reforco";
  drawerBalance?: number;
}

export function CashMovementDialog({
  open,
  onOpenChange,
  onAddMovement,
  isAdding,
  defaultType = "sangria",
  drawerBalance = 0,
}: CashMovementDialogProps) {
  const [type, setType] = useState<"sangria" | "reforco">(defaultType);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setType(defaultType);
  }, [defaultType]);

  const value = parseFloat(amount) || 0;
  const exceedsDrawer = type === "sangria" && value > drawerBalance + 0.001;

  const handleAdd = () => {
    if (!value || value <= 0) return;
    if (exceedsDrawer) return;
    onAddMovement(type, value, description.trim() || undefined);
    setAmount("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimentação de Caixa</DialogTitle>
          <DialogDescription>
            Registre sangrias ou reforços de caixa
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Tipo de Movimentação</Label>
            <RadioGroup value={type} onValueChange={(v: any) => setType(v)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sangria" id="sangria" />
                <Label htmlFor="sangria" className="font-normal cursor-pointer">
                  Sangria (retirada de dinheiro)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="reforco" id="reforco" />
                <Label htmlFor="reforco" className="font-normal cursor-pointer">
                  Reforço (entrada de dinheiro)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {type === "sangria" && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Saldo disponível na gaveta: </span>
              <span className="font-semibold tabular-nums">{formatBRL(drawerBalance)}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">Valor</Label>
            <CurrencyInput
              id="amount"
              value={amount}
              onChange={setAmount}
              autoFocus
            />
          </div>

          {exceedsDrawer && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Sangria não permitida — valor ({formatBRL(value)}) maior que o saldo da gaveta ({formatBRL(drawerBalance)}).
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Motivo (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Descreva o motivo da movimentação..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAdding}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isAdding || !value || value <= 0 || exceedsDrawer}
          >
            {isAdding ? "Registrando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
