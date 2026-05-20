import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryMetrics } from "@/hooks/use-delivery-reports";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface OrdersAnalysisProps {
  metrics: DeliveryMetrics;
}

const COLORS = {
  completed: "hsl(var(--chart-1))",
  cancelled: "hsl(var(--chart-5))",
  delivery: "hsl(var(--chart-2))",
  pickup: "hsl(var(--chart-3))",
};

type Slice = { name: string; value: number; color: string };

function Donut({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          stroke="hsl(var(--background))"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Slice;
            const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="font-medium text-foreground">{p.name}</p>
                <p className="text-muted-foreground">
                  {p.value} pedido(s) · {pct}%
                </p>
              </div>
            );
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value, entry) => {
            const v = (entry?.payload as any)?.value ?? 0;
            const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0";
            return (
              <span className="text-xs text-foreground">
                {value} — <span className="text-muted-foreground">{v} ({pct}%)</span>
              </span>
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export const OrdersAnalysis = ({ metrics }: OrdersAnalysisProps) => {
  const statusData: Slice[] = [
    { name: "Concluídos", value: metrics.completedOrders, color: COLORS.completed },
    { name: "Cancelados", value: metrics.cancelledOrders, color: COLORS.cancelled },
    {
      name: "Em andamento",
      value: Math.max(
        0,
        metrics.totalOrders - metrics.completedOrders - metrics.cancelledOrders
      ),
      color: "hsl(var(--chart-4))",
    },
  ].filter((s) => s.value > 0);

  const typeData: Slice[] = [
    { name: "Delivery", value: metrics.deliveryOrders, color: COLORS.delivery },
    { name: "Retirada", value: metrics.pickupOrders, color: COLORS.pickup },
  ].filter((s) => s.value > 0);

  return (
    <div id="orders-analysis" className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Status dos Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.totalOrders === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Nenhum pedido no período
            </div>
          ) : (
            <Donut data={statusData} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipo de Pedido</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.totalOrders === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Nenhum pedido no período
            </div>
          ) : (
            <Donut data={typeData} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
