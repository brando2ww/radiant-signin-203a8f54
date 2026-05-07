import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, DollarSign, CreditCard, Smartphone, Ticket } from "lucide-react";
import { formatBRL } from "@/lib/format";

type PaymentMethodKey =
  | "dinheiro"
  | "cartao"
  | "credito"
  | "debito"
  | "pix"
  | "vale_refeicao";

interface Movement {
  id: string;
  type: "entrada" | "sangria" | "reforco" | "venda";
  amount: number;
  payment_method?: PaymentMethodKey;
  description: string | null;
  created_at: string;
  source?: string | null;
}

interface CashMovementsListProps {
  movements: Movement[];
}

const TYPE_CONFIG = {
  entrada: { label: "Entrada", icon: ArrowUp, variant: "default" as const },
  sangria: { label: "Sangria", icon: ArrowDown, variant: "destructive" as const },
  reforco: { label: "Reforço", icon: ArrowUp, variant: "default" as const },
  venda: { label: "Venda", icon: DollarSign, variant: "default" as const },
};

const PAYMENT_METHOD_CONFIG: Record<PaymentMethodKey, { label: string; icon: typeof DollarSign }> = {
  dinheiro: { label: "Dinheiro", icon: DollarSign },
  cartao: { label: "Cartão", icon: CreditCard },
  credito: { label: "Crédito", icon: CreditCard },
  debito: { label: "Débito", icon: CreditCard },
  pix: { label: "PIX", icon: Smartphone },
  vale_refeicao: { label: "Vale-refeição", icon: Ticket },
};

export function CashMovementsList({ movements }: CashMovementsListProps) {
  if (movements.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Nenhuma movimentação registrada</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Horário</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Forma de Pagamento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => {
            const config = TYPE_CONFIG[movement.type];
            const Icon = config.icon;
            const paymentConfig = movement.payment_method
              ? PAYMENT_METHOD_CONFIG[movement.payment_method]
              : null;
            const PaymentIcon = paymentConfig?.icon;

            return (
              <TableRow key={movement.id}>
                <TableCell className="font-medium">
                  {format(new Date(movement.created_at), "HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={config.variant} className="gap-1">
                      <Icon className="h-3 w-3" />
                      {config.label}
                    </Badge>
                    {(movement.source === "delivery" || movement.source === "delivery_online") && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        Delivery{movement.source === "delivery_online" ? " (online)" : ""}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {movement.description || "-"}
                </TableCell>
                <TableCell>
                  {paymentConfig ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      {PaymentIcon && <PaymentIcon className="h-3.5 w-3.5" />}
                      {paymentConfig.label}
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    movement.type === "sangria"
                      ? "text-destructive"
                      : "text-success"
                  }`}
                >
                  {movement.type === "sangria" ? "-" : "+"} {formatBRL(movement.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
