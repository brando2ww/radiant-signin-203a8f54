import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DailySales } from "@/hooks/use-delivery-reports";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";

interface SalesChartProps {
  data: DailySales[];
}

type Metric = "orders" | "revenue" | "averageTicket";

const META: Record<Metric, { label: string; format: (v: number) => string }> = {
  orders: { label: "Pedidos", format: (v) => String(Math.round(v)) },
  revenue: { label: "Receita", format: (v) => formatBRL(v) },
  averageTicket: { label: "Ticket Médio", format: (v) => formatBRL(v) },
};

export const SalesChart = ({ data }: SalesChartProps) => {
  const [metric, setMetric] = useState<Metric>("orders");

  const chartData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        dateFormatted: format(new Date(item.date + "T00:00:00"), "dd/MM", { locale: ptBR }),
      })),
    [data]
  );

  const average = useMemo(() => {
    if (!chartData.length) return 0;
    return chartData.reduce((s, d) => s + (d[metric] as number), 0) / chartData.length;
  }, [chartData, metric]);

  return (
    <Card id="sales">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle>Evolução de Vendas</CardTitle>
        <ToggleGroup
          type="single"
          size="sm"
          value={metric}
          onValueChange={(v) => v && setMetric(v as Metric)}
        >
          <ToggleGroupItem value="orders">Pedidos</ToggleGroupItem>
          <ToggleGroupItem value="revenue">Receita</ToggleGroupItem>
          <ToggleGroupItem value="averageTicket">Ticket Médio</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="dateFormatted" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={(v) =>
                metric === "orders" ? String(v) : formatBRL(Number(v)).replace("R$", "").trim()
              }
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as DailySales & { dateFormatted: string };
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-medium text-foreground">
                      {format(new Date(d.date + "T00:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </p>
                    <div className="mt-1 space-y-0.5 text-muted-foreground">
                      <p>Pedidos: <span className="text-foreground font-medium">{d.orders}</span></p>
                      <p>Receita: <span className="text-foreground font-medium">{formatBRL(d.revenue)}</span></p>
                      <p>Ticket médio: <span className="text-foreground font-medium">{formatBRL(d.averageTicket)}</span></p>
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={average}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{
                value: `Média: ${META[metric].format(average)}`,
                fill: "hsl(var(--muted-foreground))",
                fontSize: 11,
                position: "insideTopRight",
              }}
            />
            <Line
              type="monotone"
              dataKey={metric}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ fill: "hsl(var(--primary))", r: 3 }}
              activeDot={{ r: 5 }}
              name={META[metric].label}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
