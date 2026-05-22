import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";

export default function PurchasesReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  const { data, isLoading } = useQuery({
    queryKey: ["report-purchases", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const { data: orders, error } = await supabase
        .from("pdv_purchase_orders")
        .select("id, order_number, supplier_id, status, order_date, expected_delivery, actual_delivery, subtotal, discount, freight, total")
        .eq("user_id", visibleUserId!)
        .gte("order_date", start.toISOString())
        .lte("order_date", end.toISOString())
        .order("order_date", { ascending: false });
      if (error) throw error;
      const orderIds = (orders || []).map((o: any) => o.id);
      const supplierIds = Array.from(new Set((orders || []).map((o: any) => o.supplier_id).filter(Boolean))) as string[];

      const [{ data: items }, { data: suppliers }] = await Promise.all([
        orderIds.length ? supabase.from("pdv_purchase_order_items").select("purchase_order_id, ingredient_id, quantity, unit_price, total_price").in("purchase_order_id", orderIds) : Promise.resolve({ data: [] as any[] }),
        supplierIds.length ? supabase.from("pdv_suppliers").select("id, name").in("id", supplierIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const ingredientIds = Array.from(new Set((items || []).map((i: any) => i.ingredient_id).filter(Boolean))) as string[];
      const { data: ingredients } = ingredientIds.length
        ? await supabase.from("pdv_ingredients").select("id, name, unit").in("id", ingredientIds)
        : { data: [] as any[] };

      const supMap = new Map((suppliers || []).map((s: any) => [s.id, s.name]));
      const ingMap = new Map((ingredients || []).map((i: any) => [i.id, i]));
      const orderMap = new Map((orders || []).map((o: any) => [o.id, o]));

      // Per supplier
      const bySup = new Map<string, { name: string; count: number; total: number; freight: number }>();
      (orders || []).forEach((o: any) => {
        const key = o.supplier_id || "—";
        const name = supMap.get(o.supplier_id) || "Sem fornecedor";
        if (!bySup.has(key)) bySup.set(key, { name, count: 0, total: 0, freight: 0 });
        const r = bySup.get(key)!;
        r.count += 1;
        r.total += Number(o.total || 0);
        r.freight += Number(o.freight || 0);
      });

      // Per ingredient
      const byIng = new Map<string, { name: string; unit: string; quantity: number; total: number; lastDate: string | null }>();
      (items || []).forEach((it: any) => {
        const ing = ingMap.get(it.ingredient_id) as any;
        const key = it.ingredient_id || "—";
        const name = ing?.name || "Sem insumo";
        const unit = ing?.unit || "";
        if (!byIng.has(key)) byIng.set(key, { name, unit, quantity: 0, total: 0, lastDate: null });
        const r = byIng.get(key)!;
        r.quantity += Number(it.quantity || 0);
        r.total += Number(it.total_price || 0);
        const od = orderMap.get(it.purchase_order_id) as any;
        if (od?.order_date && (!r.lastDate || od.order_date > r.lastDate)) r.lastDate = od.order_date;
      });

      const ingredientList = Array.from(byIng.values()).map((r) => ({
        ...r,
        avgPrice: r.quantity > 0 ? r.total / r.quantity : 0,
      })).sort((a, b) => b.total - a.total);

      return {
        orders: (orders || []).map((o: any) => ({ ...o, supplier_name: supMap.get(o.supplier_id) || "—" })),
        bySupplier: Array.from(bySup.values()).sort((a, b) => b.total - a.total),
        byIngredient: ingredientList,
      };
    },
  });

  const orders = data?.orders || [];
  const bySupplier = data?.bySupplier || [];
  const byIngredient = data?.byIngredient || [];

  const totals = useMemo(() => ({
    count: orders.length,
    total: orders.reduce((s, o: any) => s + Number(o.total || 0), 0),
    freight: orders.reduce((s, o: any) => s + Number(o.freight || 0), 0),
    suppliers: bySupplier.length,
  }), [orders, bySupplier]);

  const onExport = () => {
    exportToXlsx(`compras-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Por Fornecedor",
        rows: bySupplier.map((r) => ({ fornecedor: r.name, ordens: r.count, total: r.total, frete: r.freight })),
        columns: [
          { key: "fornecedor", label: "Fornecedor", width: 30 },
          { key: "ordens", label: "Ordens", width: 10, type: "number" },
          { key: "total", label: "Total", width: 14, type: "currency" },
          { key: "frete", label: "Frete", width: 12, type: "currency" },
        ],
      },
      {
        name: "Por Insumo",
        rows: byIngredient.map((r) => ({
          insumo: r.name, unidade: r.unit, quantidade: r.quantity, preco_medio: r.avgPrice, total: r.total, ultima_compra: r.lastDate,
        })),
        columns: [
          { key: "insumo", label: "Insumo", width: 30 },
          { key: "unidade", label: "Un", width: 8 },
          { key: "quantidade", label: "Qtd", width: 12, type: "number" },
          { key: "preco_medio", label: "Preço médio", width: 14, type: "currency" },
          { key: "total", label: "Total", width: 14, type: "currency" },
          { key: "ultima_compra", label: "Última compra", width: 16, type: "date" },
        ],
      },
      {
        name: "Ordens de Compra",
        rows: orders.map((o: any) => ({
          numero: o.order_number, data: o.order_date, fornecedor: o.supplier_name, status: o.status,
          subtotal: Number(o.subtotal || 0), desconto: Number(o.discount || 0), frete: Number(o.freight || 0), total: Number(o.total || 0),
          entrega_prevista: o.expected_delivery, entrega_realizada: o.actual_delivery,
        })),
        columns: [
          { key: "numero", label: "Nº", width: 10 },
          { key: "data", label: "Data", width: 14, type: "date" },
          { key: "fornecedor", label: "Fornecedor", width: 26 },
          { key: "status", label: "Status", width: 14 },
          { key: "subtotal", label: "Subtotal", width: 14, type: "currency" },
          { key: "desconto", label: "Desconto", width: 14, type: "currency" },
          { key: "frete", label: "Frete", width: 12, type: "currency" },
          { key: "total", label: "Total", width: 14, type: "currency" },
          { key: "entrega_prevista", label: "Prevista", width: 14, type: "date" },
          { key: "entrega_realizada", label: "Realizada", width: 14, type: "date" },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader title="Compras" description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`} onExport={onExport} exportDisabled={isLoading || orders.length === 0} />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Ordens" value={String(totals.count)} />
        <Kpi label="Total comprado" value={formatBRL(totals.total)} />
        <Kpi label="Frete total" value={formatBRL(totals.freight)} />
        <Kpi label="Fornecedores" value={String(totals.suppliers)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Por fornecedor</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Ordens</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Frete</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {bySupplier.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem compras</TableCell></TableRow> :
                    bySupplier.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.total)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.freight)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por insumo</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Preço médio</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {byIngredient.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem itens</TableCell></TableRow> :
                    byIngredient.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name} <span className="text-xs text-muted-foreground">{r.unit}</span></TableCell>
                        <TableCell className="text-right">{r.quantity.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.avgPrice)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.total)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Ordens de compra</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Frete</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {orders.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem ordens no período</TableCell></TableRow> :
                    orders.map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell>#{o.order_number ?? "—"}</TableCell>
                        <TableCell>{o.order_date ? format(new Date(o.order_date), "dd/MM/yy", { locale: ptBR }) : "—"}</TableCell>
                        <TableCell>{o.supplier_name}</TableCell>
                        <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{o.status}</span></TableCell>
                        <TableCell className="text-right">{formatBRL(o.subtotal)}</TableCell>
                        <TableCell className="text-right">{formatBRL(o.freight)}</TableCell>
                        <TableCell className="text-right font-medium">{formatBRL(o.total)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1 truncate">{value}</p></CardContent></Card>;
}
