import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { paymentMethodLabel, canonicalPaymentMethodKey } from "@/lib/financial/payment-method-keys";

interface PaymentMethodChartProps {
  data: Array<{
    method: string;
    total: number;
    count: number;
    percentage: number;
  }>;
  isLoading: boolean;
}

// Distinct shades using design-system chart tokens
const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
  "hsl(var(--muted-foreground))",
];

function labelFor(method: string) {
  const key = canonicalPaymentMethodKey(method);
  if (key === "fiado" || method === "fiado") return "Fiado";
  return paymentMethodLabel(method);
}

export function PaymentMethodChart({ data, isLoading }: PaymentMethodChartProps) {
  const { chartData, total, totalCount } = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.total - a.total);
    const grandTotal = sorted.reduce((s, d) => s + d.total, 0) || 1;
    const grandCount = sorted.reduce((s, d) => s + d.count, 0);

    const big: typeof sorted = [];
    const small: typeof sorted = [];
    sorted.forEach((d) => {
      const pct = (d.total / grandTotal) * 100;
      (pct < 2 ? small : big).push(d);
    });

    const merged = [...big];
    if (small.length > 1) {
      merged.push({
        method: "__outros__",
        total: small.reduce((s, d) => s + d.total, 0),
        count: small.reduce((s, d) => s + d.count, 0),
        percentage: small.reduce((s, d) => s + (d.total / grandTotal) * 100, 0),
      });
    } else if (small.length === 1) {
      merged.push(small[0]);
    }

    return {
      chartData: merged.map((d, i) => ({
        key: d.method,
        name: d.method === "__outros__" ? "Outros" : labelFor(d.method),
        value: d.total,
        count: d.count,
        percentage: (d.total / grandTotal) * 100,
        color: PALETTE[i % PALETTE.length],
      })),
      total: sorted.reduce((s, d) => s + d.total, 0),
      totalCount: grandCount,
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!chartData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Formas de Pagamento</CardTitle>
          <CardDescription>Distribuição por método</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Nenhuma venda registrada no período</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Formas de Pagamento</CardTitle>
        <CardDescription>Distribuição por método</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6 items-center">
          {/* Donut */}
          <div className="relative w-full md:w-1/2 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, item: any) => [
                    `${formatBRL(value)} • ${item?.payload?.percentage?.toFixed(1)}% • ${item?.payload?.count} venda(s)`,
                    item?.payload?.name,
                  ]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-lg font-semibold text-foreground">{formatBRL(total)}</span>
              <span className="text-[11px] text-muted-foreground">{totalCount} venda(s)</span>
            </div>
          </div>

          {/* Legend */}
          <ul className="w-full md:w-1/2 space-y-2">
            {chartData.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-3 w-3 rounded-sm shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{entry.name}</p>
                    <p className="text-[11px] text-muted-foreground">{entry.count} venda(s)</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {formatBRL(entry.value)}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {entry.percentage.toFixed(1)}%
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
