import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePeakHours } from "@/hooks/use-peak-hours";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Loader2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Props {
  userId: string;
  startDate: Date;
  endDate: Date;
}

export const PeakHoursHeatmap = ({ userId, startDate, endDate }: Props) => {
  const { data, isLoading } = usePeakHours(userId, startDate, endDate);

  return (
    <Card id="peak-hours">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Horários de Pico
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : data.total === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Nenhum pedido no período
          </div>
        ) : (
          <div className="space-y-6">
            {/* Heatmap */}
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <div className="grid" style={{ gridTemplateColumns: "auto repeat(24, minmax(20px, 1fr))" }}>
                  <div />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div
                      key={h}
                      className="text-[10px] text-muted-foreground text-center pb-1 tabular-nums"
                    >
                      {h % 3 === 0 ? `${h}h` : ""}
                    </div>
                  ))}
                  {DAYS.map((day, d) => (
                    <>
                      <div
                        key={`label-${d}`}
                        className="text-xs text-muted-foreground pr-2 flex items-center justify-end"
                      >
                        {day}
                      </div>
                      {Array.from({ length: 24 }).map((_, h) => {
                        const v = data.matrix[d][h];
                        const intensity = data.max > 0 ? v / data.max : 0;
                        return (
                          <div
                            key={`c-${d}-${h}`}
                            title={`${day} · ${h.toString().padStart(2, "0")}h-${(h + 1)
                              .toString()
                              .padStart(2, "0")}h: ${v} pedido(s)`}
                            className={cn(
                              "h-7 m-[1px] rounded-sm border border-border",
                              v === 0 ? "bg-muted" : "bg-primary"
                            )}
                            style={{
                              opacity: v === 0 ? 0.3 : 0.25 + intensity * 0.75,
                            }}
                          />
                        );
                      })}
                    </>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  Menos
                  <div className="flex gap-[2px]">
                    {[0.25, 0.5, 0.75, 1].map((o) => (
                      <div
                        key={o}
                        className="h-3 w-4 rounded-sm bg-primary"
                        style={{ opacity: o }}
                      />
                    ))}
                  </div>
                  Mais · pico: {data.max} pedido(s)
                </div>
              </div>
            </div>

            {/* Hourly distribution */}
            <div>
              <p className="text-sm font-medium mb-2">Distribuição por hora do dia</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.byHour} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(h) => `${h}h`}
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { hour: number; orders: number };
                      return (
                        <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="text-foreground">
                            {p.hour.toString().padStart(2, "0")}h —{" "}
                            <span className="font-medium">{p.orders} pedido(s)</span>
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
