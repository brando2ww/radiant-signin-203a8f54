import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { canonicalPaymentMethodKey, paymentMethodLabel } from "@/lib/financial/payment-method-keys";
import { usePaymentMethodFees } from "@/hooks/use-payment-method-fees";

interface PeriodTotals {
  method: string;
  label: string;
  count: number;
  gross: number;
  feePercentageAvg: number;
  feeFixedTotal: number;
  feeTotal: number;
  net: number;
}

export function PaymentFeesReport() {
  const { user } = useAuth();
  const { data: catalogFees = [] } = usePaymentMethodFees();

  const [from, setFrom] = useState<Date>(startOfMonth(new Date()));
  const [to, setTo] = useState<Date>(endOfMonth(new Date()));

  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    catalogFees.forEach((f) => m.set(f.method_key, f.label));
    return m;
  }, [catalogFees]);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-fees-report", user?.id, from.toISOString(), to.toISOString()],
    enabled: !!user?.id,
    queryFn: async () => {
      const fromStr = format(from, "yyyy-MM-dd");
      const toStr = format(to, "yyyy-MM-dd");
      const toEnd = toStr + "T23:59:59";

      // 1) Pedidos do PDV do dono no período
      const { data: orders } = await supabase
        .from("pdv_orders")
        .select("id")
        .eq("user_id", user!.id)
        .gte("created_at", fromStr)
        .lte("created_at", toEnd);
      const orderIds = (orders ?? []).map((o: any) => o.id);

      let payments: any[] = [];
      if (orderIds.length > 0) {
        const { data: pays } = await supabase
          .from("pdv_payments")
          .select("payment_method, amount, gross_amount, fee_amount, fee_percentage_applied, fee_fixed_applied, net_amount")
          .in("order_id", orderIds);
        payments = pays ?? [];
      }

      // 2) Recebimentos financeiros pagos no período
      const { data: tx } = await supabase
        .from("pdv_financial_transactions")
        .select("payment_method, amount, gross_amount, fee_amount, fee_percentage_applied, fee_fixed_applied, net_amount")
        .eq("user_id", user!.id)
        .eq("transaction_type", "receivable")
        .eq("status", "paid")
        .gte("payment_date", fromStr)
        .lte("payment_date", toStr);

      const all = [...payments, ...(tx ?? [])];

      const totalsByMethod = new Map<string, PeriodTotals>();
      let pctSum = new Map<string, { sum: number; n: number }>();

      for (const r of all) {
        const key = canonicalPaymentMethodKey(r.payment_method);
        const gross = Number(r.gross_amount ?? r.amount ?? 0);
        const fee = Number(r.fee_amount ?? 0);
        const feeFixed = Number(r.fee_fixed_applied ?? 0);
        const net = Number(r.net_amount ?? gross);
        const pct = Number(r.fee_percentage_applied ?? 0);

        const cur =
          totalsByMethod.get(key) ?? {
            method: key,
            label: labelByKey.get(key) ?? paymentMethodLabel(key),
            count: 0,
            gross: 0,
            feePercentageAvg: 0,
            feeFixedTotal: 0,
            feeTotal: 0,
            net: 0,
          };
        cur.count += 1;
        cur.gross += gross;
        cur.feeFixedTotal += feeFixed;
        cur.feeTotal += fee;
        cur.net += net;
        totalsByMethod.set(key, cur);

        const pa = pctSum.get(key) ?? { sum: 0, n: 0 };
        pa.sum += pct;
        pa.n += 1;
        pctSum.set(key, pa);
      }

      const rows = Array.from(totalsByMethod.values()).map((r) => ({
        ...r,
        feePercentageAvg:
          (pctSum.get(r.method)?.sum ?? 0) / Math.max(1, pctSum.get(r.method)?.n ?? 1),
      }));

      rows.sort((a, b) => b.gross - a.gross);

      const totals = rows.reduce(
        (acc, r) => {
          acc.count += r.count;
          acc.gross += r.gross;
          acc.feeFixedTotal += r.feeFixedTotal;
          acc.feeTotal += r.feeTotal;
          acc.net += r.net;
          return acc;
        },
        { count: 0, gross: 0, feeFixedTotal: 0, feeTotal: 0, net: 0 },
      );

      return { rows, totals };
    },
  });

  const setQuick = (kind: "today" | "7d" | "30d" | "month") => {
    const now = new Date();
    if (kind === "today") {
      setFrom(now);
      setTo(now);
    } else if (kind === "7d") {
      setFrom(subDays(now, 6));
      setTo(now);
    } else if (kind === "30d") {
      setFrom(subDays(now, 29));
      setTo(now);
    } else {
      setFrom(startOfMonth(now));
      setTo(endOfMonth(now));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Taxas por forma de pagamento</CardTitle>
            <CardDescription>
              Comparativo de bruto, taxas e líquido recebido por método no período.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setQuick("today")}>
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuick("7d")}>
              7 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuick("30d")}>
              30 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuick("month")}>
              Mês atual
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(from, "dd/MM", { locale: ptBR })} -{" "}
                  {format(to, "dd/MM/yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex flex-col sm:flex-row">
                  <Calendar
                    mode="single"
                    selected={from}
                    onSelect={(d) => d && setFrom(d)}
                    locale={ptBR}
                  />
                  <Calendar
                    mode="single"
                    selected={to}
                    onSelect={(d) => d && setTo(d)}
                    locale={ptBR}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma entrada registrada no período.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Qtde</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">% médio</TableHead>
                  <TableHead className="text-right">Taxa fixa</TableHead>
                  <TableHead className="text-right">Taxa total</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.method}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(r.gross)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.feePercentageAvg.toFixed(2).replace(".", ",")}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(r.feeFixedTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(r.feeTotal)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatBRL(r.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {data.totals.count}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatBRL(data.totals.gross)}
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBRL(data.totals.feeFixedTotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBRL(data.totals.feeTotal)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatBRL(data.totals.net)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
