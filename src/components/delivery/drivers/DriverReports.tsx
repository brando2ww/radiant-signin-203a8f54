import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { formatBRL } from "@/lib/format";
import { useDriverReports } from "@/hooks/use-driver-reports";
import {
  DriverWithStats,
  initialsFromName,
} from "@/hooks/use-delivery-drivers";

interface Props {
  drivers: DriverWithStats[];
}

function formatMinutes(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function DriverReports({ drivers }: Props) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [driverFilter, setDriverFilter] = useState<string>("all");

  const report = useDriverReports(days, driverFilter as any);
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  const sortedDrivers = [...report.drivers].sort((a, b) => b.deliveries - a.deliveries);
  const top = sortedDrivers[0];
  const topDriver = top ? driverById.get(top.driver_id) : null;

  return (
    <section className="mt-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold">Relatórios de desempenho</h2>
          <p className="text-sm text-muted-foreground">
            Análise de entregas, horários e faturamento por entregador
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os entregadores</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Entregas" value={String(report.totals.deliveries)} />
        <Kpi label="Em rota" value={String(report.totals.inRoute)} />
        <Kpi
          label="Canceladas"
          value={String(report.totals.cancelled)}
          hint={`${report.totals.cancellationRate.toFixed(1)}% do total`}
        />
        <Kpi label="Faturamento" value={formatBRL(report.totals.revenue)} />
        <Kpi
          label="Taxas de entrega"
          value={formatBRL(report.totals.fees)}
          hint={`Ticket médio ${formatBRL(report.totals.avgTicket)}`}
        />
        <Kpi
          label="Tempo médio de rota"
          value={formatMinutes(report.totals.avgRouteMinutes)}
          hint={topDriver ? `Top: ${topDriver.name}` : undefined}
        />
      </div>

      {/* Daily chart */}
      <div className="rounded-md border bg-card p-4 mt-4">
        <h3 className="text-sm font-semibold mb-3">Entregas por dia</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.perDay}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) =>
                  name === "revenue" ? [formatBRL(v), "Faturamento"] : [v, "Entregas"]
                }
                labelFormatter={(l) => `Dia ${l}`}
              />
              <Bar dataKey="uses" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekday + buckets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="rounded-md border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Por dia da semana</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.perWeekday}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="weekday" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="uses" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-md border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Por faixa de horário</h3>
          <div className="space-y-2 pt-2">
            {report.perBucket.map((b) => {
              const max = Math.max(1, ...report.perBucket.map((x) => x.uses));
              return (
                <div key={b.bucket}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{b.bucket}</span>
                    <span className="font-medium">{b.uses}</span>
                  </div>
                  <Progress value={(b.uses / max) * 100} className="h-2" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per driver table */}
      <div className="rounded-md border bg-card p-4 mt-4">
        <h3 className="text-sm font-semibold mb-3">Desempenho por entregador</h3>
        {sortedDrivers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Sem entregas no período selecionado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entregador</TableHead>
                <TableHead className="text-right">Entregas</TableHead>
                <TableHead className="text-right">Em rota</TableHead>
                <TableHead className="text-right">Canceladas</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Taxas</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
                <TableHead className="text-right">Tempo médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDrivers.map((dp) => {
                const d = driverById.get(dp.driver_id);
                return (
                  <TableRow key={dp.driver_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          {d?.avatar_url && <AvatarImage src={d.avatar_url} />}
                          <AvatarFallback
                            className="text-xs"
                            style={{ background: d?.avatar_color || undefined, color: "#fff" }}
                          >
                            {initialsFromName(d?.name || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{d?.name || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{dp.deliveries}</TableCell>
                    <TableCell className="text-right">{dp.inRoute}</TableCell>
                    <TableCell className="text-right">{dp.cancelled}</TableCell>
                    <TableCell className="text-right">{formatBRL(dp.revenue)}</TableCell>
                    <TableCell className="text-right">{formatBRL(dp.fees)}</TableCell>
                    <TableCell className="text-right">{formatBRL(dp.avgTicket)}</TableCell>
                    <TableCell className="text-right">
                      {formatMinutes(dp.avgRouteMinutes)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
