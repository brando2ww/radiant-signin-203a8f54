import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApuracao } from "@/hooks/use-ponto-jornada";
import { usePontoColaboradores } from "@/hooks/use-ponto";
import { hhmm } from "@/lib/ponto/calculo";
import { gerarArquivo, previaDosFormatos, type FormatoHora } from "@/lib/ponto/exportador";

const mesAtual = () => new Date().toISOString().slice(0, 7);

const PRESETS = [
  { valor: "csv", rotulo: "Planilha simples (qualquer sistema)", formato: "decimal" as FormatoHora },
  { valor: "alterdata", rotulo: "Alterdata DP", formato: "minutos" as FormatoHora },
  { valor: "sage_iob", rotulo: "Sage Gestão Contábil / IOB", formato: "sexagesimal" as FormatoHora },
];

export default function PontoFolha() {
  const [competencia, setCompetencia] = useState(mesAtual);
  const [preset, setPreset] = useState<"csv" | "alterdata" | "sage_iob">("csv");
  const [formato, setFormato] = useState<FormatoHora>("decimal");
  const [codigoEmpresa, setCodigoEmpresa] = useState("");
  const [codigos, setCodigos] = useState<Record<string, string>>({});

  const { data: apuracao = [], isLoading } = useApuracao(competencia);
  const { colaboradores } = usePontoColaboradores();

  const rubricas = useMemo(() => {
    const set = new Set<string>();
    apuracao.forEach((c) => c.totais.forEach((t) => set.add(t.rubrica)));
    return [...set].sort();
  }, [apuracao]);

  const faltamCodigos = rubricas.filter((r) => !codigos[r]?.trim());

  const linhas = useMemo(
    () =>
      apuracao.flatMap((c) => {
        const colaborador = colaboradores.find((x) => x.id === c.colaborador_id);
        return c.totais.map((t) => ({
          matricula: colaborador?.matricula_contador || colaborador?.cpf || c.colaborador_id.slice(0, 6),
          rubrica: t.rubrica,
          codigoEvento: codigos[t.rubrica] ?? "",
          minutos: t.minutos,
          dias: t.dias,
        }));
      }),
    [apuracao, codigos, colaboradores],
  );

  const baixar = () => {
    if (faltamCodigos.length) return;
    const conteudo = gerarArquivo(linhas, { preset, formatoHora: formato, codigoEmpresa, competencia });
    const blob = new Blob([conteudo], { type: "text/plain;charset=iso-8859-1" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ponto-${competencia}-${preset}.${preset === "csv" ? "csv" : "txt"}`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Arquivo gerado");
  };

  const exemplo = linhas.find((l) => l.minutos > 0)?.minutos ?? 150;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Exportar para a folha</h1>
          <p className="text-sm text-muted-foreground">
            O arquivo que o escritório de contabilidade importa no sistema de folha dele.
          </p>
        </div>
        <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-40" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-4 lg:col-span-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Sistema do contador</Label>
            <Select
              value={preset}
              onValueChange={(v: any) => {
                setPreset(v);
                setFormato(PRESETS.find((p) => p.valor === v)!.formato);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Formato da hora</Label>
            <Select value={formato} onValueChange={(v: any) => setFormato(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {previaDosFormatos(exemplo).map((f) => (
                  <SelectItem key={f.formato} value={f.formato}>{f.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Código da empresa no sistema do contador</Label>
            <Input value={codigoEmpresa} onChange={(e) => setCodigoEmpresa(e.target.value)} placeholder="opcional" />
          </div>

          {/* A conferência que evita o erro mais caro do módulo. */}
          <div className="rounded-md border p-3">
            <p className="mb-1.5 text-xs font-medium">
              {hhmm(exemplo)} escrito em cada formato
            </p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {previaDosFormatos(exemplo).map((f) => (
                <li key={f.formato} className={f.formato === formato ? "font-medium text-foreground" : ""}>
                  {f.rotulo}: <span className="font-mono">{f.valor}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Confira com o contador qual é o certo. Formato trocado não gera erro nenhum na
              importação: só paga salário errado.
            </p>
          </div>

          <Button className="w-full" onClick={baixar} disabled={!linhas.length || faltamCodigos.length > 0}>
            <Download className="mr-2 h-4 w-4" /> Gerar arquivo
          </Button>
          {faltamCodigos.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Falta o código de {faltamCodigos.length} {faltamCodigos.length === 1 ? "rubrica" : "rubricas"}.
              O código do evento é do escritório: peça a relação a ele.
            </p>
          )}
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          {isLoading ? (
            <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : rubricas.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nada apurado nesta competência.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rubrica do Velara</TableHead>
                  <TableHead className="w-40">Código no contador</TableHead>
                  <TableHead className="text-right">Total do mês</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rubricas.map((r) => {
                  const total = apuracao.reduce(
                    (s, c) => s + (c.totais.find((t) => t.rubrica === r)?.minutos ?? 0), 0,
                  );
                  return (
                    <TableRow key={r}>
                      <TableCell className="font-medium">{r}</TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          placeholder="ex.: 009"
                          value={codigos[r] ?? ""}
                          onChange={(e) => setCodigos({ ...codigos, [r]: e.target.value })}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{hhmm(total)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
