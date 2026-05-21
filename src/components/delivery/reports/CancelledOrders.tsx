import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { getCancelCategoryLabel } from "@/lib/cancel-reasons";
import { Loader2, XCircle } from "lucide-react";

interface CancelledOrdersProps {
  userId: string;
  startDate: Date;
  endDate: Date;
}

interface Row {
  id: string;
  order_number: string;
  customer_name: string;
  total: number;
  cancelled_at: string;
  cancellation_reason: string | null;
  cancellation_category: string | null;
  customer_notified: boolean | null;
  cancelled_by_user_id: string | null;
  operator_name: string | null;
}

export function CancelledOrders({
  userId,
  startDate,
  endDate,
}: CancelledOrdersProps) {
  const { data, isLoading } = useQuery({
    queryKey: [
      "delivery-cancelled-orders",
      userId,
      startDate.toISOString(),
      endDate.toISOString(),
    ],
    enabled: !!userId,
    queryFn: async (): Promise<Row[]> => {
      const { data: orders, error } = await supabase
        .from("delivery_orders")
        .select(
          "id, order_number, customer_name, total, cancelled_at, cancellation_reason, cancellation_category, customer_notified, cancelled_by_user_id",
        )
        .eq("user_id", userId)
        .eq("status", "cancelled")
        .gte("cancelled_at", startDate.toISOString())
        .lte("cancelled_at", endDate.toISOString())
        .order("cancelled_at", { ascending: false });
      if (error) throw error;

      const ids = Array.from(
        new Set(
          (orders || [])
            .map((o: any) => o.cancelled_by_user_id)
            .filter(Boolean),
        ),
      );
      const nameById = new Map<string, string>();
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        (profiles || []).forEach((p: any) =>
          nameById.set(p.id, p.full_name || ""),
        );
      }
      return (orders || []).map((o: any) => ({
        ...o,
        total: Number(o.total),
        operator_name: o.cancelled_by_user_id
          ? nameById.get(o.cancelled_by_user_id) || null
          : null,
      })) as Row[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-destructive" />
          Pedidos cancelados
          {data && (
            <Badge variant="secondary" className="ml-2">
              {data.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum pedido cancelado no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-center">Cliente informado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(new Date(r.cancelled_at), "dd/MM/yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="font-medium">
                      #{r.order_number}
                    </TableCell>
                    <TableCell>{r.customer_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(r.total)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.operator_name || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {getCancelCategoryLabel(r.cancellation_category)}
                    </TableCell>
                    <TableCell className="text-xs max-w-[280px]">
                      <span className="line-clamp-2">
                        {r.cancellation_reason || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {r.customer_notified ? (
                        <Badge variant="outline">Sim</Badge>
                      ) : (
                        <Badge variant="secondary">Não</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
