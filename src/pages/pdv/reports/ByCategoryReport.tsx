import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatBRL } from "@/lib/format";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))"];

interface CatRow { category: string; quantity: number; revenue: number; share: number; }

export default function ByCategoryReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-by-category", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<CatRow[]> => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from("pdv_order_items")
        .select("product_id, product_name, quantity, subtotal, order:pdv_orders!inner(user_id, status, closed_at)")
        .eq("order.user_id", visibleUserId!)
        .eq("order.status", "fechada")
        .gte("order.closed_at", start.toISOString())
        .lte("order.closed_at", end.toISOString());
      if (error) throw error;

      const pids = Array.from(new Set((data || []).map((d: any) => d.product_id).filter(Boolean)));
      const { data: products } = pids.length
        ? await supabase.from("pdv_products").select("id, category").in("id", pids as string[])
        : { data: [] as any[] };
      const catMap = new Map((products || []).map((p: any) => [p.id, p.category || "Sem categoria"]));

      const grouped = new Map<string, CatRow>();
      (data || []).forEach((it: any) => {
        const cat = catMap.get(it.product_id) || "Sem categoria";
        if (!grouped.has(cat)) grouped.set(cat, { category: cat, quantity: 0, revenue: 0, share: 0 });
        const r = grouped.get(cat)!;
        r.quantity += Number(it.quantity || 0);
        r.revenue += Number(it.subtotal || 0);
      });
      const list = Array.from(grouped.values());
      const total = list.reduce((s, r) => s + r.revenue, 0);
      list.forEach((r) => { r.share = total > 0 ? r.revenue / total : 0; });
      return list.sort((a, b) => b.revenue - a.revenue);
    },
  });

  const total = useMemo(() => rows.reduce((s, r) => s + r.revenue, 0), [rows]);

  const onExport = () => {
    exportToXlsx(`vendas-por-categoria-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Categorias",
        rows: rows.map((r) => ({
          categoria: r.category,
          quantidade: r.quantity,
          receita: r.revenue,
          participacao: r.share,
        })),
        columns: [
          { key: "categoria", label: "Categoria", width: 30 },
          { key: "quantidade", label: "Qtd", width: 10, type: "number" },
          { key: "receita", label: "Receita", width: 16, type: "currency" },
          { key: "participacao", label: "% Receita", width: 12, type: "percent" },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader
        title="Vendas por Categoria"
        description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`}
        onExport={onExport} exportDisabled={isLoading || rows.length === 0}
      />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Categorias com venda" value={String(rows.length)} />
        <Kpi label="Receita total" value={formatBRL(total)} />
        <Kpi label="Top categoria" value={rows[0]?.category || "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Participação</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[300px] w-full" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={rows} dataKey="revenue" nameKey="category" outerRadius={100} label={(e: any) => `${(e.share * 100).toFixed(0)}%`}>
                      {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tabela</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados</TableCell></TableRow> :
                    rows.map((r) => (
                      <TableRow key={r.category}>
                        <TableCell className="font-medium">{r.category}</TableCell>
                        <TableCell className="text-right">{r.quantity.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.revenue)}</TableCell>
                        <TableCell className="text-right">{(r.share * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1 truncate">{value}</p></CardContent></Card>;
}
