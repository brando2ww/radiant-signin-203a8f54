import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEmployeeConsumption } from "@/hooks/use-employee-consumption";
import { AuthorizedEmployee } from "@/hooks/use-authorized-employees";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { ConsumptionEntryDetails } from "./ConsumptionEntryDetails";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: AuthorizedEmployee | null;
}

export function EmployeeStatementSheet({ open, onOpenChange, employee }: Props) {
  const { entries, payments } = useEmployeeConsumption(employee?.id);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const timeline = useMemo(() => {
    const items: any[] = [];
    entries.forEach((e) =>
      items.push({ type: "consumo", date: e.created_at, amount: e.total, data: e }),
    );
    payments.forEach((p) =>
      items.push({ type: "pagamento", date: p.created_at, amount: p.amount, data: p }),
    );
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, payments]);

  if (!employee) return null;

  const initials =
    employee.full_name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {employee.avatar_url && <AvatarImage src={employee.avatar_url} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle>{employee.full_name}</SheetTitle>
              <SheetDescription>
                {employee.role_title || "Sem cargo"} ·{" "}
                <span className={employee.balance && employee.balance > 0 ? "text-destructive font-medium" : "text-foreground"}>
                  Saldo: {formatBRL(employee.balance || 0)}
                </span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 mt-4">
          <div className="space-y-2 pr-3">
            {timeline.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhuma movimentação ainda.
              </p>
            )}
            {timeline.map((it, idx) => {
              const isConsumo = it.type === "consumo";
              const entryId = isConsumo ? it.data.id : null;
              const isOpen = entryId ? !!expanded[entryId] : false;
              return (
                <Card key={idx}>
                  <CardContent className="p-3">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3 text-left"
                      onClick={() => {
                        if (entryId) {
                          setExpanded((p) => ({ ...p, [entryId]: !p[entryId] }));
                        }
                      }}
                      disabled={!isConsumo}
                    >
                      <div className="flex items-center gap-3">
                        {isConsumo ? (
                          <ArrowUpCircle className="h-5 w-5 text-destructive" />
                        ) : (
                          <ArrowDownCircle className="h-5 w-5 text-primary" />
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {isConsumo ? "Consumo" : "Quitação"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(it.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                          {isConsumo && Array.isArray(it.data.items) && (
                            <p className="text-xs text-muted-foreground">
                              {it.data.items.length} item(s)
                              {Number(it.data.discount || 0) > 0 ? " · c/ desconto" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="font-semibold">{formatBRL(it.amount)}</p>
                          {isConsumo && (
                            <Badge variant={it.data.status === "pago" ? "secondary" : "outline"} className="text-xs">
                              {it.data.status === "pago"
                                ? "Pago"
                                : it.data.status === "pago_parcial"
                                  ? "Parcial"
                                  : "Pendente"}
                            </Badge>
                          )}
                        </div>
                        {isConsumo && (
                          isOpen
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                    {isConsumo && isOpen && (
                      <ConsumptionEntryDetails entry={it.data} />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
