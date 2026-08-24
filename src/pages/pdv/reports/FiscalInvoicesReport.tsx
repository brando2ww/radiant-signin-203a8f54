import { useMemo, useState } from "react";
import { subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { formatBRL } from "@/lib/format";
import { ReportShell, periodLabel } from "@/components/pdv/reports/ReportShell";
import type { ExportKind } from "@/components/pdv/reports/ReportPageHeader";
import { exportReport, brandedFromSheets } from "@/lib/reports/branded-export";
import { useReportBrand } from "@/hooks/use-report-brand";

type Recorte = "todas" | "pendentes" | "incompletas";

/**
 * Notas fiscais recebidas.
 *
 * Cobre a ENTRADA — o que os fornecedores emitiram contra o CNPJ da casa, via
 * importação de XML ou manifestação do destinatário. A emissão própria fica de
 * fora de propósito: a tabela de notas emitidas não existe neste banco, e um
 * bloco somando zero pareceria "não vendi nada com nota" em vez de "isto não
 * está implementado". O aviso na tela diz isso em voz alta.
 *
 * `mde_nfe_completa = false` é o caso que mais dá dor de cabeça: a nota foi
 * manifestada mas o XML completo ainda não chegou da SEFAZ, então valor e itens
 * podem estar incompletos. Sem essa coluna à vista, o gestor confere um total
 * que ainda vai mudar.
 */
export default function FiscalInvoicesReport() {
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());
  const [recorte, setRecorte] = useState<Recorte>("todas");

  const { visibleUserId } = useEstablishmentId();
  const { businessName } = useReportBrand();
  const rotuloPeriodo = periodLabel(startDate, endDate);

  const { data, isLoading } = useQuery({
    queryKey: ["report-fiscal", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_invoices")
        .select(
          "id, invoice_number, series, invoice_key, emission_date, entry_date, supplier_name, supplier_cnpj, total_products, total_tax, total_invoice, status, source, mde_status, mde_nfe_completa",
        )
        .eq("user_id", visibleUserId!)
        .gte("emission_date", format(startDate, "yyyy-MM-dd"))
        .lte("emission_date", format(endDate, "yyyy-MM-dd"))
        .order("emission_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const notas = data ?? [];

  const linhas = useMemo(() => {
    if (recorte === "pendentes") return notas.filter((n) => !n.entry_date);
    if (recorte === "incompletas") return notas.filter((n) => n.mde_nfe_completa === false);
    return notas;
  }, [notas, recorte]);

  const porFornecedor = useMemo(() => {
    const m = new Map<string, { nome: string; cnpj: string; qtd: number; total: number; imposto: number }>();
    notas.forEach((n) => {
      const chave = n.supplier_cnpj || n.supplier_name;
      const a = m.get(chave) ?? {
        nome: n.supplier_name, cnpj: n.supplier_cnpj, qtd: 0, total: 0, imposto: 0,
      };
      a.qtd += 1;
      a.total += Number(n.total_invoice) || 0;
      a.imposto += Number(n.total_tax) || 0;
      m.set(chave, a);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [notas]);

  const total = notas.reduce((s, n) => s + (Number(n.total_invoice) || 0), 0);
  const imposto = notas.reduce((s, n) => s + (Number(n.total_tax) || 0), 0);
  const semEntrada = notas.filter((n) => !n.entry_date).length;
  const incompletas = notas.filter((n) => n.mde_nfe_completa === false).length;

  const onExport = async (kind: ExportKind) => {
    await exportReport(
      kind,
      brandedFromSheets(
        {
          title: "Notas Fiscais Recebidas",
          businessName,
          periodLabel: rotuloPeriodo,
          filtersLabel: recorte === "todas" ? undefined : `Recorte: ${recorte}`,
          kpis: [
            { label: "Notas", value: String(notas.length) },
            { label: "Total", value: formatBRL(total) },
            { label: "Impostos", value: formatBRL(imposto) },
            { label: "Sem entrada", value: String(semEntrada) },
          ],
          filename: "notas-fiscais-recebidas",
        },
        [
          {
            name: "Por fornecedor",
            rows: porFornecedor.map((f) => ({
              fornecedor: f.nome,
              cnpj: f.cnpj,
              notas: f.qtd,
              total: f.total,
              impostos: f.imposto,
            })),
            columns: [
              { key: "fornecedor", label: "Fornecedor", width: 32 },
              { key: "cnpj", label: "CNPJ", width: 20 },
              { key: "notas", label: "Notas", width: 10, type: "number" },
              { key: "total", label: "Total", width: 16, type: "currency" },
              { key: "impostos", label: "Impostos", width: 14, type: "currency" },
            ],
          },
          {
            name: "Notas",
            rows: linhas.map((n) => ({
              numero: n.invoice_number,
              serie: n.series ?? "",
              emissao: n.emission_date,
              entrada: n.entry_date ?? "",
              fornecedor: n.supplier_name,
              cnpj: n.supplier_cnpj,
              produtos: Number(n.total_products) || 0,
              impostos: Number(n.total_tax) || 0,
              total: Number(n.total_invoice) || 0,
              origem: n.source,
              manifestacao: n.mde_status ?? "",
              xml_completo: n.mde_nfe_completa === false ? "não" : "sim",
              chave: n.invoice_key,
            })),
            columns: [
              { key: "numero", label: "Número", width: 12 },
              { key: "serie", label: "Série", width: 8 },
              { key: "emissao", label: "Emissão", width: 14, type: "date" },
              { key: "entrada", label: "Entrada", width: 14, type: "date" },
              { key: "fornecedor", label: "Fornecedor", width: 30 },
              { key: "cnpj", label: "CNPJ", width: 20 },
              { key: "produtos", label: "Produtos", width: 14, type: "currency" },
              { key: "impostos", label: "Impostos", width: 14, type: "currency" },
              { key: "total", label: "Total", width: 14, type: "currency" },
              { key: "origem", label: "Origem", width: 12 },
              { key: "manifestacao", label: "Manifestação", width: 16 },
              { key: "xml_completo", label: "XML completo", width: 14 },
              { key: "chave", label: "Chave", width: 46 },
            ],
          },
        ],
      ),
    );
  };

  return (
    <ReportShell
      title="Notas Fiscais Recebidas"
      description="O que os fornecedores emitiram contra o seu CNPJ, e o que ainda não virou entrada"
      onExport={onExport}
      exportDisabled={isLoading}
      period={{ startDate, endDate, onChange: (s, e) => { setStartDate(s); setEndDate(e); } }}
    >
      {incompletas > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs leading-relaxed">
            <strong>{incompletas} nota(s) sem XML completo.</strong> Foram manifestadas, mas a
            SEFAZ ainda não devolveu o documento inteiro · valor e itens podem mudar. Confira
            antes de fechar o mês com o contador.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Notas no período</p>
          <p className="mt-1 text-2xl font-semibold">{isLoading ? "—" : notas.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Total das notas</p>
          <p className="mt-1 text-2xl font-semibold">{isLoading ? "—" : formatBRL(total)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Impostos</p>
          <p className="mt-1 text-2xl font-semibold">{isLoading ? "—" : formatBRL(imposto)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Sem entrada no estoque</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">
            {isLoading ? "—" : semEntrada}
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Por fornecedor</CardTitle></CardHeader>
        <CardContent>
          {porFornecedor.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma nota no período.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Fornecedor</th>
                  <th className="px-2 py-2 text-right font-medium">Notas</th>
                  <th className="px-2 py-2 text-right font-medium">Impostos</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {porFornecedor.map((f) => (
                  <tr key={f.cnpj || f.nome}>
                    <td className="px-2 py-2">{f.nome}</td>
                    <td className="px-2 py-2 text-right">{f.qtd}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                      {formatBRL(f.imposto)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                      {formatBRL(f.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Notas</CardTitle>
          <div className="flex gap-1">
            {(["todas", "pendentes", "incompletas"] as const).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={recorte === r ? "secondary" : "ghost"}
                onClick={() => setRecorte(r)}
                className="capitalize"
              >
                {r === "pendentes" ? "Sem entrada" : r === "incompletas" ? "XML incompleto" : "Todas"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma nota neste recorte.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Nota</th>
                    <th className="px-2 py-2 text-left font-medium">Fornecedor</th>
                    <th className="px-2 py-2 text-left font-medium">Emissão</th>
                    <th className="px-2 py-2 text-right font-medium">Impostos</th>
                    <th className="px-2 py-2 text-right font-medium">Total</th>
                    <th className="px-2 py-2 text-right font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {linhas.map((n) => (
                    <tr key={n.id}>
                      <td className="whitespace-nowrap px-2 py-2">
                        {n.invoice_number}
                        {n.series && <span className="text-muted-foreground">/{n.series}</span>}
                      </td>
                      <td className="px-2 py-2">{n.supplier_name}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                        {format(new Date(`${n.emission_date}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                        {formatBRL(Number(n.total_tax) || 0)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        {formatBRL(Number(n.total_invoice) || 0)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {n.mde_nfe_completa === false && (
                            <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-600">
                              XML incompleto
                            </Badge>
                          )}
                          {n.entry_date ? (
                            <Badge variant="secondary" className="text-[10px]">Entrada dada</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Sem entrada</Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Este relatório cobre notas <strong>recebidas</strong>. Notas emitidas pela casa não
        aparecem aqui porque ainda não são gravadas neste banco · mostrar um total zerado
        pareceria "não emiti nada" em vez de "isto não existe ainda".
      </p>
    </ReportShell>
  );
}
