import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { DeliveryCoupon } from "@/hooks/use-delivery-coupons";
import { useCouponAnalytics } from "@/hooks/use-coupon-analytics";

interface Props {
  coupon: DeliveryCoupon | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CouponAnalyticsDialog({ coupon, open, onOpenChange }: Props) {
  const analytics = useCouponAnalytics(coupon?.code ?? null, !!coupon && open);

  if (!coupon) return null;

  const { totals, perDay, perWeekday, perTimeBucket, topCustomers, rows, isLoading } = analytics;
  const usagePct = Math.min(
    100,
    (coupon.usage_count / Math.max(1, coupon.usage_limit)) * 100
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <DialogTitle className="font-mono">{coupon.code}</DialogTitle>
            <Badge variant="secondary">
              {coupon.type === "percentage"
                ? `${coupon.value}% OFF`
                : `${formatBRL(coupon.value)} OFF`}
            </Badge>
            <Badge variant="outline">
              Válido até {format(new Date(coupon.valid_until), "dd/MM/yyyy", { locale: ptBR })}
            </Badge>
            <Badge variant={coupon.is_active ? "default" : "outline"}>
              {coupon.is_active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <DialogDescription>
            Análise de uso, dias, horários e clientes deste cupom.
          </DialogDescription>
        </DialogHeader>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Usos totais" value={String(totals.uses)} hint={`${coupon.usage_count}/${coupon.usage_limit} cota`}>
            <Progress value={usagePct} className="h-1.5 mt-2" />
          </Kpi>
          <Kpi label="Economia gerada" value={formatBRL(totals.savings)} hint={`Média ${formatBRL(totals.avgDiscount)}/pedido`} />
          <Kpi label="Faturamento" value={formatBRL(totals.revenue)} hint={`Ticket médio ${formatBRL(totals.avgTicket)}`} />
          <Kpi
            label="Janela de uso"
            value={
              totals.firstUse && totals.lastUse
                ? `${format(totals.firstUse, "dd/MM", { locale: ptBR })} → ${format(totals.lastUse, "dd/MM", { locale: ptBR })}`
                : "—"
            }
            hint={totals.lastUse ? `Último: ${format(totals.lastUse, "dd/MM HH:mm", { locale: ptBR })}` : "Sem usos"}
          />
        </div>

        {/* Daily chart */}
        <section className="rounded-md border bg-card p-4">
          <h4 className="text-sm font-semibold mb-3">Uso nos últimos 30 dias</h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perDay}>
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
                    name === "savings" ? [formatBRL(v), "Economia"] : [v, "Usos"]
                  }
                  labelFormatter={(l) => `Dia ${l}`}
                />
                <Bar dataKey="uses" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Weekday */}
          <section className="rounded-md border bg-card p-4">
            <h4 className="text-sm font-semibold mb-3">Por dia da semana</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perWeekday}>
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
          </section>

          {/* Time bucket */}
          <section className="rounded-md border bg-card p-4">
            <h4 className="text-sm font-semibold mb-3">Por horário</h4>
            <div className="space-y-2">
              {perTimeBucket.map((b) => {
                const max = Math.max(1, ...perTimeBucket.map((x) => x.uses));
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
          </section>
        </div>

        {/* Top customers */}
        <section className="rounded-md border bg-card p-4">
          <h4 className="text-sm font-semibold mb-3">Top clientes</h4>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados de clientes ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Usos</TableHead>
                  <TableHead className="text-right">Economia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-right">{c.uses}</TableCell>
                    <TableCell className="text-right">{formatBRL(c.savings)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* History */}
        <section className="rounded-md border bg-card p-4">
          <h4 className="text-sm font-semibold mb-3">Histórico recente</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Este cupom ainda não foi usado.
                  </TableCell>
                </TableRow>
              )}
              {rows.slice(0, 50).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    {format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">#{r.order_number}</TableCell>
                  <TableCell className="text-sm">{r.customer_name || "—"}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.total)}</TableCell>
                  <TableCell className="text-right">-{formatBRL(r.discount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      {children}
    </div>
  );
}
