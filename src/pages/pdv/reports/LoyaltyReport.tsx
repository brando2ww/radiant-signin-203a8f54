import { useMemo, useState } from "react";
import { subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { ReportShell, periodLabel } from "@/components/pdv/reports/ReportShell";
import type { ExportKind } from "@/components/pdv/reports/ReportPageHeader";
import { exportReport, brandedFromSheets } from "@/lib/reports/branded-export";
import { useReportBrand } from "@/hooks/use-report-brand";
import { useCustomerReports } from "@/hooks/reports/use-customer-reports";

const STATUS_LABEL: Record<string, { texto: string; variante: "default" | "secondary" | "destructive" | "outline" }> = {
  applied: { texto: "Aplicado", variante: "default" },
  reserved: { texto: "Reservado", variante: "secondary" },
  cancelled: { texto: "Cancelado", variante: "outline" },
  expired: { texto: "Expirado", variante: "outline" },
};

/**
 * Fidelidade.
 *
 * O programa de pontos parece de graça até alguém somar os descontos. Aqui o
 * custo aparece: quanto foi resgatado, em que prêmios, e quanto isso abateu de
 * verdade da receita.
 *
 * Só resgate APLICADO conta como custo. Reservado ainda pode ser cancelado e o
 * ponto volta para o cliente; tratar reserva como despesa inflaria o custo do
 * programa em todo carrinho abandonado.
 */
export default function LoyaltyReport() {
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());

  const { data, isLoading } = useCustomerReports(startDate, endDate);
  const { businessName } = useReportBrand();
  const rotuloPeriodo = periodLabel(startDate, endDate);

  const porPremio = useMemo(() => {
    const m = new Map<string, { nome: string; qtd: number; pontos: number; custo: number }>();
    (data?.resgates ?? [])
      .filter((r) => r.status === "applied")
      .forEach((r) => {
        const a = m.get(r.prizeName) ?? { nome: r.prizeName, qtd: 0, pontos: 0, custo: 0 };
        a.qtd += 1;
        a.pontos += r.pointsCost;
        a.custo += r.discountAmount;
        m.set(r.prizeName, a);
      });
    return [...m.values()].sort((a, b) => b.qtd - a.qtd);
  }, [data]);

  const onExport = async (kind: ExportKind) => {
    if (!data) return;
    await exportReport(
      kind,
      brandedFromSheets(
        {
          title: "Fidelidade",
          businessName,
          periodLabel: rotuloPeriodo,
          kpis: [
            { label: "Resgates aplicados", value: String(data.resgates.filter((r) => r.status === "applied").length) },
            { label: "Pontos gastos", value: data.pontosGastos.toLocaleString("pt-BR") },
            { label: "Custo em desconto", value: formatBRL(data.custoDosResgates) },
          ],
          filename: "fidelidade",
        },
        [
          {
            name: "Por prêmio",
            rows: porPremio.map((p) => ({
              premio: p.nome,
              resgates: p.qtd,
              pontos: p.pontos,
              custo: p.custo,
            })),
            columns: [
              { key: "premio", label: "Prêmio", width: 32 },
              { key: "resgates", label: "Resgates", width: 12, type: "number" },
              { key: "pontos", label: "Pontos gastos", width: 14, type: "number" },
              { key: "custo", label: "Custo (R$)", width: 14, type: "currency" },
            ],
          },
          {
            name: "Resgates",
            rows: data.resgates.map((r) => ({
              data: r.createdAt,
              cliente: r.customerName,
              premio: r.prizeName,
              tipo: r.kind === "discount" ? "Desconto" : "Produto",
              pontos: r.pointsCost,
              desconto: r.discountAmount,
              status: STATUS_LABEL[r.status]?.texto ?? r.status,
            })),
            columns: [
              { key: "data", label: "Data", width: 18, type: "datetime" },
              { key: "cliente", label: "Cliente", width: 26 },
              { key: "premio", label: "Prêmio", width: 28 },
              { key: "tipo", label: "Tipo", width: 12 },
              { key: "pontos", label: "Pontos", width: 10, type: "number" },
              { key: "desconto", label: "Desconto", width: 14, type: "currency" },
              { key: "status", label: "Status", width: 14 },
            ],
          },
        ],
      ),
    );
  };

  const aplicados = (data?.resgates ?? []).filter((r) => r.status === "applied");

  return (
    <ReportShell
      title="Fidelidade"
      description="Quanto o programa de pontos moveu e quanto ele custou"
      onExport={onExport}
      exportDisabled={isLoading || !data}
      period={{ startDate, endDate, onChange: (s, e) => { setStartDate(s); setEndDate(e); } }}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Resgates aplicados</p>
            <p className="mt-1 text-2xl font-semibold">{data ? aplicados.length : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Pontos gastos</p>
            <p className="mt-1 text-2xl font-semibold">
              {data ? data.pontosGastos.toLocaleString("pt-BR") : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Custo em desconto</p>
            <p className="mt-1 text-2xl font-semibold">
              {data ? formatBRL(data.custoDosResgates) : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">o que o programa abateu</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Reservados sem uso</p>
            <p className="mt-1 text-2xl font-semibold">
              {data ? data.resgates.filter((r) => r.status === "reserved").length : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">ainda podem virar desconto</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Prêmios mais resgatados</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : porPremio.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum prêmio foi resgatado no período.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Prêmio</th>
                  <th className="px-2 py-2 text-right font-medium">Resgates</th>
                  <th className="px-2 py-2 text-right font-medium">Pontos</th>
                  <th className="px-2 py-2 text-right font-medium">Custo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {porPremio.map((p) => (
                  <tr key={p.nome}>
                    <td className="px-2 py-2">{p.nome}</td>
                    <td className="px-2 py-2 text-right">{p.qtd}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">
                      {p.pontos.toLocaleString("pt-BR")}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                      {formatBRL(p.custo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Resgates do período</CardTitle></CardHeader>
        <CardContent>
          {(data?.resgates.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem resgates no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Data</th>
                    <th className="px-2 py-2 text-left font-medium">Cliente</th>
                    <th className="px-2 py-2 text-left font-medium">Prêmio</th>
                    <th className="px-2 py-2 text-right font-medium">Pontos</th>
                    <th className="px-2 py-2 text-right font-medium">Desconto</th>
                    <th className="px-2 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.resgates ?? []).map((r) => {
                    const s = STATUS_LABEL[r.status] ?? { texto: r.status, variante: "outline" as const };
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                          {format(new Date(r.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                        </td>
                        <td className="px-2 py-2">{r.customerName}</td>
                        <td className="px-2 py-2">{r.prizeName}</td>
                        <td className="px-2 py-2 text-right">{r.pointsCost}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          {r.discountAmount > 0 ? formatBRL(r.discountAmount) : "—"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Badge variant={s.variante} className="text-[10px]">{s.texto}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}
