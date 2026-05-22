import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ComposedChart, Line, ScatterChart, Scatter, ZAxis, LineChart,
} from "recharts";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { useProductAnalytics, ChannelKey, ProductRow } from "@/hooks/reports/use-product-analytics";
import { exportToXlsx } from "@/lib/xlsx-export";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

const CHANNEL_LABEL: Record<ChannelKey, string> = { salao: "Salão", balcao: "Balcão", delivery: "Delivery" };

export default function ProductsAnalyticsReport() {
  const [start, setStart] = useState<Date>(startOfMonth(new Date()));
  const [end, setEnd] = useState<Date>(endOfMonth(new Date()));
  const [channels, setChannels] = useState<ChannelKey[]>(["salao", "balcao", "delivery"]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const { data, isLoading } = useProductAnalytics({ start, end, channels });

  const categories = useMemo(
    () => Array.from(new Set((data?.rows || []).map((r) => r.category))).sort(),
    [data?.rows],
  );

  const filtered = useMemo(() => {
    const list = data?.rows || [];
    return list.filter((r) =>
      (category === "all" || r.category === category) &&
      r.product_name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [data?.rows, category, search]);

  const onExport = () => {
    if (!data) return;
    const period = `${format(start, "yyyy-MM-dd")}_${format(end, "yyyy-MM-dd")}`;
    exportToXlsx(`analise-de-produtos-${period}`, [
      {
        name: "Ranking",
        rows: filtered.map((r) => ({
          produto: r.product_name, categoria: r.category, abc: r.abc,
          quantidade: r.quantity, receita: r.revenue, cmv: r.cmv, lucro: r.profit,
          margem: r.margin / 100, pedidos: r.orders, ticket_item: r.avg_ticket_item,
          participacao: r.share, delta_vs_anterior: r.delta_pct !== null ? r.delta_pct / 100 : "",
        })),
        columns: [
          { key: "produto", label: "Produto", width: 36 },
          { key: "categoria", label: "Categoria", width: 22 },
          { key: "abc", label: "ABC", width: 6 },
          { key: "quantidade", label: "Qtd", width: 10, type: "number" },
          { key: "receita", label: "Receita", width: 14, type: "currency" },
          { key: "cmv", label: "CMV", width: 14, type: "currency" },
          { key: "lucro", label: "Lucro Bruto", width: 14, type: "currency" },
          { key: "margem", label: "Margem", width: 10, type: "percent" },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
          { key: "ticket_item", label: "Ticket/Item", width: 14, type: "currency" },
          { key: "participacao", label: "% Receita", width: 12, type: "percent" },
          { key: "delta_vs_anterior", label: "Δ vs anterior", width: 14, type: "percent" },
        ],
      },
      {
        name: "Curva ABC",
        rows: filtered.map((r) => ({ produto: r.product_name, abc: r.abc, receita: r.revenue, participacao: r.share })),
        columns: [
          { key: "produto", label: "Produto", width: 36 },
          { key: "abc", label: "Classe", width: 8 },
          { key: "receita", label: "Receita", width: 14, type: "currency" },
          { key: "participacao", label: "% Receita", width: 12, type: "percent" },
        ],
      },
      {
        name: "Canais",
        rows: filtered.map((r) => ({
          produto: r.product_name,
          salao_qtd: r.channels.salao.qty, salao_rec: r.channels.salao.revenue,
          balcao_qtd: r.channels.balcao.qty, balcao_rec: r.channels.balcao.revenue,
          delivery_qtd: r.channels.delivery.qty, delivery_rec: r.channels.delivery.revenue,
          total_rec: r.revenue,
        })),
        columns: [
          { key: "produto", label: "Produto", width: 36 },
          { key: "salao_qtd", label: "Salão Qtd", width: 12, type: "number" },
          { key: "salao_rec", label: "Salão R$", width: 14, type: "currency" },
          { key: "balcao_qtd", label: "Balcão Qtd", width: 12, type: "number" },
          { key: "balcao_rec", label: "Balcão R$", width: 14, type: "currency" },
          { key: "delivery_qtd", label: "Delivery Qtd", width: 12, type: "number" },
          { key: "delivery_rec", label: "Delivery R$", width: 14, type: "currency" },
          { key: "total_rec", label: "Total", width: 14, type: "currency" },
        ],
      },
      {
        name: "Produtos Parados",
        rows: data.inactive.map((p) => ({
          produto: p.name, categoria: p.category, preco: p.price,
          dias_sem_venda: p.days_since_last_sale ?? "Nunca vendido",
        })),
        columns: [
          { key: "produto", label: "Produto", width: 36 },
          { key: "categoria", label: "Categoria", width: 22 },
          { key: "preco", label: "Preço", width: 14, type: "currency" },
          { key: "dias_sem_venda", label: "Dias sem venda", width: 18 },
        ],
      },
      {
        name: "Cancelados",
        rows: data.cancelled.map((c) => ({
          produto: c.product_name, quantidade: c.quantity, valor_perdido: c.value, pedidos: c.orders,
        })),
        columns: [
          { key: "produto", label: "Produto", width: 36 },
          { key: "quantidade", label: "Qtd", width: 10, type: "number" },
          { key: "valor_perdido", label: "Valor perdido", width: 16, type: "currency" },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
        ],
      },
      {
        name: "Modificadores",
        rows: data.modifiers.map((m) => ({ modificador: m.name, vezes: m.count, receita_extra: m.extra_revenue })),
        columns: [
          { key: "modificador", label: "Modificador", width: 30 },
          { key: "vezes", label: "Vezes", width: 10, type: "number" },
          { key: "receita_extra", label: "Receita extra", width: 14, type: "currency" },
        ],
      },
      {
        name: "Kits",
        rows: data.kits.map((k) => ({
          kit: k.name, quantidade: k.quantity, receita: k.revenue,
          componentes: k.children.map((c) => `${c.quantity}x ${c.name}`).join(" | "),
        })),
        columns: [
          { key: "kit", label: "Kit", width: 30 },
          { key: "quantidade", label: "Qtd", width: 10, type: "number" },
          { key: "receita", label: "Receita", width: 14, type: "currency" },
          { key: "componentes", label: "Componentes", width: 60 },
        ],
      },
      {
        name: "Cobertura Estoque",
        rows: data.coverage.map((c) => ({
          ingrediente: c.ingredient_name, estoque: c.current_stock, unidade: c.unit,
          consumo_dia: c.consumption_per_day, dias_restantes: c.days_left ?? "—", status: c.status,
        })),
        columns: [
          { key: "ingrediente", label: "Ingrediente", width: 30 },
          { key: "estoque", label: "Estoque", width: 12, type: "number" },
          { key: "unidade", label: "Unidade", width: 8 },
          { key: "consumo_dia", label: "Consumo/dia", width: 14, type: "number" },
          { key: "dias_restantes", label: "Dias restantes", width: 16 },
          { key: "status", label: "Status", width: 10 },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader
        title="Análise de Produtos"
        description={`Período: ${format(start, "dd/MM/yyyy", { locale: ptBR })} a ${format(end, "dd/MM/yyyy", { locale: ptBR })}`}
        onExport={onExport}
        exportDisabled={isLoading || !data}
      />

      <ReportDateFilter
        startDate={start}
        endDate={end}
        onChange={(s, e) => { setStart(s); setEnd(e); }}
        extra={(
          <div className="flex items-center gap-2">
            <ChannelToggle channels={channels} onChange={setChannels} />
          </div>
        )}
      />

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-center">
          <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground ml-auto">{filtered.length} produto(s) no filtro</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="abc">Curva ABC</TabsTrigger>
          <TabsTrigger value="margin">Margem</TabsTrigger>
          <TabsTrigger value="trend">Tendência</TabsTrigger>
          <TabsTrigger value="channels">Canais</TabsTrigger>
          <TabsTrigger value="heat">Horários</TabsTrigger>
          <TabsTrigger value="inactive">Parados</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelados</TabsTrigger>
          <TabsTrigger value="modifiers">Modificadores</TabsTrigger>
          <TabsTrigger value="kits">Kits</TabsTrigger>
          <TabsTrigger value="coverage">Cobertura</TabsTrigger>
        </TabsList>

        {isLoading || !data ? (
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <>
            <TabsContent value="overview"><OverviewSection rows={filtered} totals={data.totals} /></TabsContent>
            <TabsContent value="ranking"><RankingSection rows={filtered} /></TabsContent>
            <TabsContent value="abc"><AbcSection rows={filtered} abc={data.abc} /></TabsContent>
            <TabsContent value="margin"><MarginSection rows={filtered} /></TabsContent>
            <TabsContent value="trend"><TrendSection rows={filtered} dailySeries={data.dailySeries} /></TabsContent>
            <TabsContent value="channels"><ChannelsSection rows={filtered} /></TabsContent>
            <TabsContent value="heat"><HeatSection hourHeat={data.hourHeat} /></TabsContent>
            <TabsContent value="inactive"><InactiveSection rows={data.inactive} /></TabsContent>
            <TabsContent value="cancelled"><CancelledSection cancelled={data.cancelled} details={data.cancelledDetails} /></TabsContent>
            <TabsContent value="modifiers"><ModifiersSection rows={data.modifiers} /></TabsContent>
            <TabsContent value="kits"><KitsSection rows={data.kits} /></TabsContent>
            <TabsContent value="coverage"><CoverageSection rows={data.coverage} /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

/* ============== Sub-components ============== */

function ChannelToggle({ channels, onChange }: { channels: ChannelKey[]; onChange: (c: ChannelKey[]) => void }) {
  const all: ChannelKey[] = ["salao", "balcao", "delivery"];
  const toggle = (c: ChannelKey) => {
    const next = channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c];
    onChange(next.length === 0 ? [c] : next);
  };
  return (
    <div className="flex gap-1">
      {all.map((c) => (
        <button
          key={c}
          onClick={() => toggle(c)}
          className={cn(
            "text-xs px-2.5 py-1 rounded-md border transition-colors",
            channels.includes(c) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {CHANNEL_LABEL[c]}
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function OverviewSection({ rows, totals }: { rows: ProductRow[]; totals: any }) {
  const top = rows[0];
  const worstMargin = rows.filter((r) => r.cmv > 0).sort((a, b) => a.margin - b.margin)[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Produtos vendidos" value={String(totals.products)} />
        <Kpi label="Qtd total" value={totals.qty.toLocaleString("pt-BR")} />
        <Kpi label="Receita" value={formatBRL(totals.revenue)} />
        <Kpi label="Pedidos distintos" value={String(totals.orders)} />
        <Kpi label="CMV" value={formatBRL(totals.cmv)} hint="apenas produtos com receita cadastrada" />
        <Kpi label="Lucro bruto" value={formatBRL(totals.profit)} />
        <Kpi label="Margem média" value={`${totals.margin.toFixed(1)}%`} />
        <Kpi label="Ticket / item" value={formatBRL(totals.avg_ticket_item)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Campeão de receita</CardTitle></CardHeader>
          <CardContent>
            {top ? (
              <>
                <p className="text-xl font-semibold">{top.product_name}</p>
                <p className="text-sm text-muted-foreground">{formatBRL(top.revenue)} · {top.quantity} un · {(top.share * 100).toFixed(1)}% da receita</p>
              </>
            ) : <p className="text-sm text-muted-foreground">Sem dados</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Pior margem</CardTitle></CardHeader>
          <CardContent>
            {worstMargin ? (
              <>
                <p className="text-xl font-semibold">{worstMargin.product_name}</p>
                <p className="text-sm text-muted-foreground">Margem {worstMargin.margin.toFixed(1)}% · CMV {formatBRL(worstMargin.cmv)}</p>
              </>
            ) : <p className="text-sm text-muted-foreground">Nenhum produto com CMV calculado</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DeltaCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1", value > 0 ? "text-foreground" : value < 0 ? "text-destructive" : "text-muted-foreground")}>
      <Icon className="h-3 w-3" />
      {value.toFixed(1)}%
    </span>
  );
}

function RankingSection({ rows }: { rows: ProductRow[] }) {
  const [sortKey, setSortKey] = useState<keyof ProductRow>("revenue");
  const [asc, setAsc] = useState(false);
  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey] as any;
      const bv = b[sortKey] as any;
      if (typeof av === "number" && typeof bv === "number") return asc ? av - bv : bv - av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr.slice(0, 200);
  }, [rows, sortKey, asc]);

  const Hdr = ({ k, label, right }: { k: keyof ProductRow; label: string; right?: boolean }) => (
    <TableHead className={cn("cursor-pointer select-none", right && "text-right")} onClick={() => { setSortKey(k); setAsc(sortKey === k ? !asc : false); }}>
      {label}{sortKey === k ? (asc ? " ↑" : " ↓") : ""}
    </TableHead>
  );

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Ranking de produtos (top 200)</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <Hdr k="product_name" label="Produto" />
                <Hdr k="category" label="Categoria" />
                <TableHead>ABC</TableHead>
                <Hdr k="quantity" label="Qtd" right />
                <Hdr k="revenue" label="Receita" right />
                <Hdr k="cmv" label="CMV" right />
                <Hdr k="profit" label="Lucro" right />
                <Hdr k="margin" label="Margem" right />
                <Hdr k="orders" label="Pedidos" right />
                <Hdr k="share" label="% Rec" right />
                <Hdr k="delta_pct" label="Δ vs anterior" right />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Sem dados</TableCell></TableRow>
              ) : sorted.map((r) => (
                <TableRow key={r.product_id}>
                  <TableCell className="font-medium">{r.product_name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.category}</TableCell>
                  <TableCell><Badge variant={r.abc === "A" ? "default" : "outline"}>{r.abc}</Badge></TableCell>
                  <TableCell className="text-right">{r.quantity.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.revenue)}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.cmv)}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.profit)}</TableCell>
                  <TableCell className="text-right">{r.cmv > 0 ? `${r.margin.toFixed(1)}%` : "—"}</TableCell>
                  <TableCell className="text-right">{r.orders}</TableCell>
                  <TableCell className="text-right">{(r.share * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right"><DeltaCell value={r.delta_pct} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function AbcSection({ rows, abc }: { rows: ProductRow[]; abc: any }) {
  let cum = 0;
  const data = rows.slice(0, 30).map((r) => {
    cum += r.share * 100;
    return { name: r.product_name.slice(0, 18), receita: r.revenue, acumulado: cum };
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {(["A", "B", "C"] as const).map((k) => (
          <Card key={k}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Classe {k}</p>
              <p className="text-2xl font-bold mt-1">{abc[k].count} produtos</p>
              <p className="text-sm text-muted-foreground mt-1">{formatBRL(abc[k].revenue)} · {(abc[k].share * 100).toFixed(1)}% da receita</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Pareto — Top 30</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" interval={0} angle={-35} textAnchor="end" height={80} />
                <YAxis yAxisId="left" tickFormatter={(v) => formatBRLCompact(v)} className="text-xs" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} className="text-xs" />
                <Tooltip formatter={(v: number, n: string) => n === "acumulado" ? `${v.toFixed(1)}%` : formatBRL(v)} />
                <Bar yAxisId="left" dataKey="receita" fill="hsl(var(--primary))" />
                <Line yAxisId="right" dataKey="acumulado" stroke="hsl(var(--foreground))" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MarginSection({ rows }: { rows: ProductRow[] }) {
  const withCmv = rows.filter((r) => r.cmv > 0);
  const topProfit = [...withCmv].sort((a, b) => b.profit - a.profit).slice(0, 10);
  const topMargin = [...withCmv].sort((a, b) => b.margin - a.margin).slice(0, 10);
  const worstMargin = [...withCmv].sort((a, b) => a.margin - b.margin).slice(0, 10);
  const scatter = withCmv.map((r) => ({ name: r.product_name, x: r.quantity, y: r.margin, z: r.revenue }));

  return (
    <div className="space-y-4">
      {withCmv.length === 0 && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          Nenhum produto vendido tem ficha técnica cadastrada — sem CMV para calcular margem.
        </CardContent></Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <SmallList title="Top 10 lucro bruto (R$)" items={topProfit.map((r) => ({ a: r.product_name, b: formatBRL(r.profit) }))} />
        <SmallList title="Top 10 maior margem" items={topMargin.map((r) => ({ a: r.product_name, b: `${r.margin.toFixed(1)}%` }))} />
        <SmallList title="Top 10 menor margem (alerta)" items={worstMargin.map((r) => ({ a: r.product_name, b: `${r.margin.toFixed(1)}%` }))} />
      </div>
      {scatter.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Quantidade × Margem</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="x" name="Qtd" className="text-xs" />
                  <YAxis dataKey="y" name="Margem" tickFormatter={(v) => `${v}%`} className="text-xs" />
                  <ZAxis dataKey="z" range={[40, 400]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any, n: string) => n === "y" ? `${Number(v).toFixed(1)}%` : v} labelFormatter={() => ""} content={(props: any) => {
                    const p = props.payload?.[0]?.payload;
                    if (!p) return null;
                    return (
                      <div className="bg-card border rounded-md p-2 text-xs shadow-sm">
                        <p className="font-semibold">{p.name}</p>
                        <p>Qtd: {p.x.toLocaleString("pt-BR")}</p>
                        <p>Margem: {p.y.toFixed(1)}%</p>
                        <p>Receita: {formatBRL(p.z)}</p>
                      </div>
                    );
                  }} />
                  <Scatter data={scatter} fill="hsl(var(--primary))" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SmallList({ title, items }: { title: string; items: { a: string; b: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados</p> : (
          <ul className="space-y-1.5 text-sm">
            {items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span className="truncate">{idx + 1}. {i.a}</span>
                <span className="font-medium tabular-nums">{i.b}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TrendSection({ rows, dailySeries }: { rows: ProductRow[]; dailySeries: any[] }) {
  const top5 = rows.slice(0, 5);
  const ids = top5.map((r) => r.product_id);
  const nameById = new Map(top5.map((r) => [r.product_id, r.product_name]));
  const data = dailySeries.map((d) => {
    const row: any = { date: format(new Date(d.date), "dd/MM") };
    ids.forEach((id) => { row[nameById.get(id)!] = d.perProduct[id] || 0; });
    return row;
  });
  const colors = ["hsl(var(--primary))", "hsl(var(--muted-foreground))", "hsl(var(--foreground))", "hsl(var(--border))", "hsl(var(--destructive))"];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tendência diária — Top 5</CardTitle></CardHeader>
      <CardContent>
        {data.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados</p> : (
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis tickFormatter={(v) => formatBRLCompact(v)} className="text-xs" />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                {top5.map((p, i) => (
                  <Line key={p.product_id} type="monotone" dataKey={p.product_name} stroke={colors[i % colors.length]} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelsSection({ rows }: { rows: ProductRow[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Vendas por canal</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Salão (qtd)</TableHead>
                <TableHead className="text-right">Salão (R$)</TableHead>
                <TableHead className="text-right">Balcão (qtd)</TableHead>
                <TableHead className="text-right">Balcão (R$)</TableHead>
                <TableHead className="text-right">Delivery (qtd)</TableHead>
                <TableHead className="text-right">Delivery (R$)</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 200).map((r) => (
                <TableRow key={r.product_id}>
                  <TableCell className="font-medium">{r.product_name}</TableCell>
                  <TableCell className="text-right">{r.channels.salao.qty}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.channels.salao.revenue)}</TableCell>
                  <TableCell className="text-right">{r.channels.balcao.qty}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.channels.balcao.revenue)}</TableCell>
                  <TableCell className="text-right">{r.channels.delivery.qty}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.channels.delivery.revenue)}</TableCell>
                  <TableCell className="text-right font-medium">{formatBRL(r.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function HeatSection({ hourHeat }: { hourHeat: number[][] }) {
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const max = Math.max(1, ...hourHeat.flat());
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Mapa de calor — Quantidade vendida</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="text-[10px] border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th className="p-1"></th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="p-1 text-muted-foreground font-normal w-7 text-center">{h}h</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hourHeat.map((row, d) => (
                <tr key={d}>
                  <td className="p-1 text-muted-foreground pr-2">{days[d]}</td>
                  {row.map((v, h) => {
                    const alpha = v / max;
                    return (
                      <td key={h} className="p-0">
                        <div
                          className="w-7 h-7 rounded-sm border border-border flex items-center justify-center"
                          style={{ backgroundColor: v === 0 ? "transparent" : `hsl(var(--primary) / ${0.15 + alpha * 0.7})` }}
                          title={`${days[d]} ${h}h — ${v} un`}
                        >
                          {v > 0 ? <span className="text-foreground">{v}</span> : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function InactiveSection({ rows }: { rows: any[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Produtos sem venda no período ({rows.length})</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Dias sem venda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Todos os produtos venderam no período 🎉</TableCell></TableRow>
              ) : rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.category}</TableCell>
                  <TableCell className="text-right">{formatBRL(p.price)}</TableCell>
                  <TableCell className="text-right">{p.days_since_last_sale === null ? <span className="text-muted-foreground">Nunca vendido</span> : `${p.days_since_last_sale}d`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CancelledSection({ cancelled, details }: { cancelled: any[]; details: any[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Itens cancelados — agregado por produto</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor perdido</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cancelled.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem cancelamentos no período</TableCell></TableRow>
                ) : cancelled.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.product_name}</TableCell>
                    <TableCell className="text-right">{c.quantity}</TableCell>
                    <TableCell className="text-right">{formatBRL(c.value)}</TableCell>
                    <TableCell className="text-right">{c.orders}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">—</TableCell></TableRow>
                ) : details.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell>{d.date ? format(new Date(d.date), "dd/MM HH:mm", { locale: ptBR }) : "—"}</TableCell>
                    <TableCell>#{d.order_number ?? "—"}</TableCell>
                    <TableCell>{d.product_name}</TableCell>
                    <TableCell className="text-right">{d.quantity}</TableCell>
                    <TableCell className="text-right">{formatBRL(d.value)}</TableCell>
                    <TableCell className="text-muted-foreground">{d.reason || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ModifiersSection({ rows }: { rows: any[] }) {
  const chartData = rows.slice(0, 15).map((r) => ({ name: r.name, vezes: r.count }));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Top 15 modificadores</CardTitle></CardHeader>
        <CardContent>
          {chartData.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados</p> : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" width={140} className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="vezes" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Tabela completa</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modificador</TableHead>
                  <TableHead className="text-right">Vezes</TableHead>
                  <TableHead className="text-right">Receita extra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem modificadores registrados</TableCell></TableRow>
                ) : rows.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell>{m.name}</TableCell>
                    <TableCell className="text-right">{m.count}</TableCell>
                    <TableCell className="text-right">{formatBRL(m.extra_revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KitsSection({ rows }: { rows: any[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Kits e Combos</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kit</TableHead>
                <TableHead className="text-right">Qtd vendida</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead>Componentes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum kit cadastrado</TableCell></TableRow>
              ) : rows.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="text-right">{k.quantity}</TableCell>
                  <TableCell className="text-right">{formatBRL(k.revenue)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {k.children.length === 0 ? "—" : k.children.map((c: any) => `${c.quantity}× ${c.name}`).join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CoverageSection({ rows }: { rows: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cobertura de estoque dos ingredientes</CardTitle>
        <p className="text-xs text-muted-foreground">Baseado no consumo médio diário do período selecionado.</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingrediente</TableHead>
                <TableHead className="text-right">Estoque atual</TableHead>
                <TableHead className="text-right">Consumo/dia</TableHead>
                <TableHead className="text-right">Dias restantes</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum ingrediente consumido no período</TableCell></TableRow>
              ) : rows.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{c.ingredient_name}</TableCell>
                  <TableCell className="text-right">{c.current_stock.toLocaleString("pt-BR")} {c.unit}</TableCell>
                  <TableCell className="text-right">{c.consumption_per_day.toFixed(2)} {c.unit}</TableCell>
                  <TableCell className="text-right">{c.days_left === null ? "—" : `${c.days_left.toFixed(1)}d`}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "danger" ? "destructive" : c.status === "warn" ? "secondary" : "outline"}>
                      {c.status === "danger" ? "Crítico" : c.status === "warn" ? "Atenção" : "OK"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
