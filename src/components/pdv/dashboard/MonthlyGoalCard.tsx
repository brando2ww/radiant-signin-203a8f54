import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Target } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { useMonthlyGoal } from "@/hooks/use-monthly-goal";

interface Props {
  monthSales: number;
  isLoadingSales?: boolean;
}

export function MonthlyGoalCard({ monthSales, isLoadingSales }: Props) {
  const { goal, isLoading, setGoal, isSaving } = useMonthlyGoal();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>("");

  useEffect(() => {
    if (open) setValue(goal ? String(goal) : "");
  }, [open, goal]);

  async function handleSave() {
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    try {
      await setGoal(n);
      toast.success("Meta salva");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar meta");
    }
  }

  const pct = goal && goal > 0 ? Math.min(100, (monthSales / goal) * 100) : 0;
  const remaining = goal ? Math.max(0, goal - monthSales) : 0;

  return (
    <>
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium">Meta do Mês</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>

          {isLoading || isLoadingSales ? (
            <Skeleton className="h-8 w-32" />
          ) : !goal ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Configure uma meta de vendas para acompanhar seu progresso.
              </p>
              <Button size="sm" onClick={() => setOpen(true)}>
                Definir meta
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-bold">{formatBRL(monthSales)}</p>
                <p className="text-sm text-muted-foreground">de {formatBRL(goal)}</p>
              </div>
              <Progress value={pct} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{pct.toFixed(1)}% atingido</span>
                <span>
                  {remaining > 0 ? `Faltam ${formatBRL(remaining)}` : "Meta atingida 🎉"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meta de vendas do mês</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="goal">Valor da meta</Label>
            <CurrencyInput id="goal" value={value} onChange={setValue} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
