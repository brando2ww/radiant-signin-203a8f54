import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import type { AdminDashboardData } from "@/hooks/use-admin-dashboard";

interface Props {
  data?: AdminDashboardData["top_tenants"];
  isLoading: boolean;
}

export function AdminTopTenants({ data, isLoading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top 10 tenants por volume</CardTitle>
        <CardDescription>Ordenados pelo volume de vendas no período</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Sem atividade registrada no período.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Delivery</TableHead>
                <TableHead className="text-right">Avaliações</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link to={`/admin/tenants/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(t.volume)}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.delivery_orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.evaluations}</TableCell>
                  <TableCell>
                    <Badge variant={t.is_active ? "secondary" : "outline"}>
                      {t.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
