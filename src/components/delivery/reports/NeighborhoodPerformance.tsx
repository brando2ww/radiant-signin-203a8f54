import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useNeighborhoodPerformance } from "@/hooks/use-neighborhood-performance";
import { Loader2, MapPin } from "lucide-react";
import { formatBRL } from "@/lib/format";

interface Props {
  userId: string;
  startDate: Date;
  endDate: Date;
}

export const NeighborhoodPerformance = ({ userId, startDate, endDate }: Props) => {
  const { data, isLoading } = useNeighborhoodPerformance(userId, startDate, endDate);

  const top = (data ?? []).slice(0, 10);
  const maxOrders = top.reduce((m, r) => Math.max(m, r.orders), 0);

  return (
    <Card id="neighborhoods">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Desempenho por Bairro
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : top.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Nenhum pedido de delivery com endereço no período
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bairro</TableHead>
                <TableHead className="w-[260px]">Pedidos</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Ticket Médio</TableHead>
                <TableHead className="text-right">Taxa Cancel.</TableHead>
                <TableHead className="text-right w-[90px]">% Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((row) => {
                const ratio = maxOrders > 0 ? (row.orders / maxOrders) * 100 : 0;
                return (
                  <TableRow key={row.neighborhood}>
                    <TableCell className="font-medium">{row.neighborhood}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Progress value={ratio} className="h-2 flex-1" />
                        <span className="text-sm tabular-nums w-10 text-right">
                          {row.orders}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(row.revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(row.averageTicket)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.cancellationRate.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.share.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
