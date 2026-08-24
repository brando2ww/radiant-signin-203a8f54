import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Loader2, Search } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { ReportShell, periodLabel } from "@/components/pdv/reports/ReportShell";
import type { ExportKind } from "@/components/pdv/reports/ReportPageHeader";
import { exportReport, brandedFromSheets } from "@/lib/reports/branded-export";
import { useReportBrand } from "@/hooks/use-report-brand";
import { useCustomerReports, DIAS_INATIVO } from "@/hooks/reports/use-customer-reports";

type Recorte = "todos" | "ativos" | "inativos";

/**
 * Clientes e recorrência.
 *
 * A pergunta de gestão aqui não é quantos clientes existem, é quem parou de
 * voltar — e quanto essa pessoa gastava antes de sumir. Por isso a coluna que
 * ordena a lista de inativos é o que ela já deixou na casa, não a data.
 */
export default function CustomersReport() {
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());
  const [recorte, setRecorte] = useState<Recorte>("todos");
  const [busca, setBusca] = useState("");

  const { data, isLoading } = useCustomerReports(startDate, endDate);
  const { businessName } = useReportBrand();
  const rotuloPeriodo = periodLabel(startDate, endDate);

  const linhas = useMemo(() => {
    if (!data) return [];
    const base =
      recorte === "inativos"
        ? data.inativos
        : recorte === "ativos"
          ? data.clientes.filter((c) => c.pedidosNoPeriodo > 0)
          : data.clientes;
    const q = busca.trim().toLowerCase();
    return q
      ? base.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q),
        )
      : base;
  }, [data, recorte, busca]);

  const onExport = async (kind: ExportKind) => {
    if (!data) return;
    const filtros = [
      recorte !== "todos" ? `Recorte: ${recorte}` : null,
      busca ? `Busca: ${busca}` : null,
    ].filter(Boolean).join(" · ");

    await exportReport(
      kind,
      brandedFromSheets(
        {
          title: "Clientes e Recorrência",
          businessName,
          periodLabel: rotuloPeriodo,
          filtersLabel: filtros || undefined,
          kpis: [
            { label: "Clientes na base", value: String(data.totalBase) },
            { label: "Compraram no período", value: String(data.ativosNoPeriodo) },
            { label: `Sem comprar há ${DIAS_INATIVO}+ dias`, value: String(data.inativos.length) },
            { label: "Receita delivery no período", value: formatBRL(data.receitaNoPeriodo) },
          ],
          filename: "clientes-e-recorrencia",
        },
        [
          {
            name: "Clientes",
            rows: linhas.map((c) => ({
              cliente: c.name,
              telefone: c.phone ?? "",
              origem: c.source === "pdv" ? "Cadastro PDV" : "Delivery",
              total_gasto: c.totalSpent,
              visitas: c.visitCount,
              ticket_medio: c.ticketMedio,
              ultima_compra: c.lastVisit ?? "",
              dias_sem_comprar: c.diasSemComprar ?? "",
              pedidos_periodo: c.pedidosNoPeriodo,
              receita_periodo: c.receitaNoPeriodo,
            })),
            columns: [
              { key: "cliente", label: "Cliente", width: 28 },
              { key: "telefone", label: "Telefone", width: 16 },
              { key: "origem", label: "Origem", width: 14 },
              { key: "total_gasto", label: "Total gasto (vida)", width: 18, type: "currency" },
              { key: "visitas", label: "Compras", width: 10, type: "number" },
              { key: "ticket_medio", label: "Ticket médio", width: 14, type: "currency" },
              { key: "ultima_compra", label: "Última compra", width: 16, type: "date" },
              { key: "dias_sem_comprar", label: "Dias sem comprar", width: 16, type: "number" },
              { key: "pedidos_periodo", label: "Pedidos no período", width: 16, type: "number" },
              { key: "receita_periodo", label: "Receita no período", width: 18, type: "currency" },
            ],
          },
          {
            name: "Inativos",
            rows: data.inativos.map((c) => ({
              cliente: c.name,
              telefone: c.phone ?? "",
              total_gasto: c.totalSpent,
              visitas: c.visitCount,
              ultima_compra: c.lastVisit ?? "",
              dias_sem_comprar: c.diasSemComprar ?? "",
            })),
            columns: [
              { key: "cliente", label: "Cliente", width: 28 },
              { key: "telefone", label: "Telefone", width: 16 },
              { key: "total_gasto", label: "Já gastou", width: 16, type: "currency" },
              { key: "visitas", label: "Compras", width: 10, type: "number" },
              { key: "ultima_compra", label: "Última compra", width: 16, type: "date" },
              { key: "dias_sem_comprar", label: "Dias sem comprar", width: 16, type: "number" },
            ],
          },
        ],
      ),
    );
  };

  return (
    <ReportShell
      title="Clientes e Recorrência"
      description="Quem volta, quanto gasta e quem parou de aparecer"
      onExport={onExport}
      exportDisabled={isLoading || !data}
      period={{ startDate, endDate, onChange: (s, e) => { setStartDate(s); setEndDate(e); } }}
    >
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs leading-relaxed">
          <strong>Total gasto</strong> e <strong>compras</strong> são da vida inteira do cliente e
          incluem o salão quando a pessoa foi identificada no caixa. As colunas{" "}
          <strong>do período</strong> contam só delivery · a comanda do salão guarda o nome do
          cliente, não o cadastro dele, então não dá para atribuir com segurança.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Clientes na base</p>
            <p className="mt-1 text-2xl font-semibold">{data ? data.totalBase : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Compraram no período</p>
            <p className="mt-1 text-2xl font-semibold">{data ? data.ativosNoPeriodo : "—"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">delivery</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Sem comprar há {DIAS_INATIVO}+ dias</p>
            <p className="mt-1 text-2xl font-semibold text-destructive">
              {data ? data.inativos.length : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Já gastaram e sumiram</p>
            <p className="mt-1 text-2xl font-semibold">
              {data ? formatBRL(data.inativos.reduce((s, c) => s + c.totalSpent, 0)) : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">valor que já passou pelo caixa</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Base de clientes</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {(["todos", "ativos", "inativos"] as const).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={recorte === r ? "secondary" : "ghost"}
                  onClick={() => setRecorte(r)}
                  className="capitalize"
                >
                  {r}
                </Button>
              ))}
            </div>
            <div className="relative w-full max-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome ou telefone"
                className="h-9 pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum cliente neste recorte.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Cliente</th>
                    <th className="px-2 py-2 text-right font-medium">Total gasto</th>
                    <th className="px-2 py-2 text-right font-medium">Compras</th>
                    <th className="px-2 py-2 text-right font-medium">Ticket médio</th>
                    <th className="px-2 py-2 text-right font-medium">Sem comprar</th>
                    <th className="px-2 py-2 text-right font-medium">No período</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {linhas.slice(0, 300).map((c) => (
                    <tr key={`${c.source}-${c.id}`}>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          {c.source === "delivery" && (
                            <Badge variant="outline" className="text-[10px]">delivery</Badge>
                          )}
                        </div>
                        {c.phone && (
                          <span className="text-xs text-muted-foreground">{c.phone}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        {formatBRL(c.totalSpent)}
                      </td>
                      <td className="px-2 py-2 text-right">{c.visitCount}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {formatBRL(c.ticketMedio)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {c.diasSemComprar == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : c.diasSemComprar > DIAS_INATIVO ? (
                          <span className="text-destructive">{c.diasSemComprar} dias</span>
                        ) : (
                          `${c.diasSemComprar} dias`
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {c.pedidosNoPeriodo > 0 ? (
                          <>
                            {c.pedidosNoPeriodo}× · {formatBRL(c.receitaNoPeriodo)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhas.length > 300 && (
                <p className="pt-3 text-center text-xs text-muted-foreground">
                  Mostrando os 300 primeiros de {linhas.length}. A exportação traz todos.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}
