import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { TopProduct } from "@/hooks/use-delivery-reports";
import { useProductDailySales } from "@/hooks/use-product-daily-sales";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { Loader2 } from "lucide-react";

interface Props {
  product: TopProduct | null;
  userId: string;
  startDate: Date;
  endDate: Date;
  onClose: () => void;
}

export const ProductSalesDrawer = ({ product, userId, startDate, endDate, onClose }: Props) => {
  const { data, isLoading } = useProductDailySales(
    userId,
    product?.productId ?? null,
    startDate,
    endDate
  );

  const chartData = (data ?? []).map((d) => ({
    ...d,
    dateFormatted: format(new Date(d.date + "T00:00:00"), "dd/MM", { locale: ptBR }),
  }));

  return (
    <Sheet open={!!product} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{product?.productName}</SheetTitle>
          <SheetDescription>
            {product?.category ?? "Sem categoria"} · {product?.quantity} unidades ·{" "}
            {formatBRL(product?.revenue ?? 0)} ({product?.revenueShare.toFixed(1)}%)
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dateFormatted" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as { date: string; quantity: number; revenue: number };
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                        <p className="font-medium text-foreground">
                          {format(new Date(d.date + "T00:00:00"), "dd 'de' MMMM", { locale: ptBR })}
                        </p>
                        <p className="text-muted-foreground">
                          {d.quantity} un · {formatBRL(d.revenue)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="quantity"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
