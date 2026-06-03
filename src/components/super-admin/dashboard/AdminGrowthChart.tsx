import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminDashboardData } from "@/hooks/use-admin-dashboard";

interface Props {
  data?: AdminDashboardData["growth"];
  isLoading: boolean;
}

export function AdminGrowthChart({ data, isLoading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Crescimento de tenants</CardTitle>
        <CardDescription>Últimos 12 meses — novos, cancelados e ativos acumulados</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.map((d) => ({
                  ...d,
                  label: format(parse(d.month, "yyyy-MM", new Date()), "MMM/yy", { locale: ptBR }),
                }))}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="novos" name="Novos" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="cancelados" name="Cancelados" stroke="hsl(var(--destructive))" strokeWidth={2} />
                <Line type="monotone" dataKey="ativos" name="Ativos" stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
