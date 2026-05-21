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
import { DollarSign, CreditCard, Smartphone, Ticket, UserCheck } from "lucide-react";
import { formatBRL } from "@/lib/format";

type PaymentMethodKey =
  | "dinheiro"
  | "cartao"
  | "credito"
  | "debito"
  | "pix"
  | "vale_refeicao"
  | "fiado";

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

const PAYMENT_METHOD_CONFIG: Record<PaymentMethodKey, { label: string; icon: typeof DollarSign }> = {
  dinheiro: { label: "Dinheiro", icon: DollarSign },
  cartao: { label: "Cartão", icon: CreditCard },
  credito: { label: "Crédito", icon: CreditCard },
  debito: { label: "Débito", icon: CreditCard },
  pix: { label: "PIX", icon: Smartphone },
  vale_refeicao: { label: "Vale-refeição", icon: Ticket },
  fiado: { label: "À Prazo", icon: UserCheck },
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
            <TableHead>Descrição</TableHead>
            <TableHead>Forma de Pagamento</TableHead>
            <TableHead className="text-right whitespace-nowrap w-[140px]">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => {
            const paymentConfig = movement.payment_method
              ? PAYMENT_METHOD_CONFIG[movement.payment_method]
              : null;
            const PaymentIcon = paymentConfig?.icon;
            const isDelivery =
              movement.source === "delivery" || movement.source === "delivery_online";

            return (
              <TableRow key={movement.id}>
                <TableCell className="font-medium">
                  {format(new Date(movement.created_at), "HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell className="max-w-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{movement.description || "-"}</span>
                    {isDelivery && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        Delivery{movement.source === "delivery_online" ? " (online)" : ""}
                      </Badge>
                    )}
                  </div>
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
                  className={`text-right font-medium whitespace-nowrap ${
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
