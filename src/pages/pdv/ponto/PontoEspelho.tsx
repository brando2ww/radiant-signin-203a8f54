import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, FileDown, Loader2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { useApuracao, useFechamento } from "@/hooks/use-ponto-jornada";
import { hhmm } from "@/lib/ponto/calculo";
import { exportReport } from "@/lib/reports/branded-export";
import { useBusinessSettings } from "@/hooks/use-business-settings";

const mesAtual = () => new Date().toISOString().slice(0, 7);

const ROTULOS: Record<string, string> = {
  horas_normais: "Horas normais",
  noturnas: "Horas noturnas",
  noturnas_reduzidas: "Noturnas (hora reduzida)",
  intervalo_suprimido: "Intervalo não concedido",
  atrasos: "Atrasos",
  faltas_horas: "Faltas em horas",
  faltas_dias: "Faltas em dias",
  feriado_trabalhado: "Feriado trabalhado",
  dsr_trabalhado: "Folga trabalhada",
};

const rotuloRubrica = (r: string) =>
  ROTULOS[r] ?? (r.startsWith("extra_") ? `Hora extra ${r.replace("extra_", "")}%` : r);

export default function PontoEspelho() {
  const [competencia, setCompetencia] = useState(mesAtual);
  const { data: apuracao = [], isLoading } = useApuracao(competencia);
  const { fechamento, fechar, reabrir } = useFechamento(competencia);
  const [motivoReabertura, setMotivoReabertura] = useState("");
  const { settings } = useBusinessSettings();
  const nomeDoEstabelecimento = settings?.business_name ?? "";

  const fechado = fechamento?.status === "fechado";

  // O que precisa ser resolvido ANTES de fechar o mês. Dia com número ímpar de
  // marcações é o que a fiscalização pune, e o sistema não pode maquiar.
  const pendencias = useMemo(() => {
    const lista: { nome: string; dia: string; problema: string }[] = [];
    for (const c of apuracao) {
      for (const d of c.dias) {
        if (d.marcacoesImpares) lista.push({ nome: c.nome, dia: d.dia, problema: "número ímpar de marcações" });
        else if (d.semMarcacao) lista.push({ nome: c.nome, dia: d.dia, problema: "dia escalado sem nenhuma marcação" });
      }
    }
    return lista;
  }, [apuracao]);

  /**
   * O papel que vai para o contador. Sai pelo mesmo exportador de marca dos
   * outros relatórios, para o cliente receber tudo com a mesma cara.
   */
  const exportar = async (tipo: "pdf" | "xlsx") => {
    await exportReport(tipo, {
      title: "Espelho de ponto",
      businessName: nomeDoEstabelecimento ?? "",
      periodLabel: competencia,
      sections: [
        {
          title: "Totais por colaborador",
          columns: ["Colaborador", "Rubrica", "Total"],
          rows: apuracao.flatMap((c) =>
            c.totais.map((t) => [c.nome, rotuloRubrica(t.rubrica), t.dias ? `${t.dias} dia(s)` : hhmm(t.minutos)]),
          ),
          align: { 2: "right" },
        },
        ...apuracao.map((c) => ({
          title: `${c.nome} · dia a dia`,
          columns: ["Dia", "Previsto", "Trabalhado", "Extra", "Noturno", "Observação"],
          align: { 1: "right" as const, 2: "right" as const, 3: "right" as const, 4: "right" as const },
          rows: c.dias.map((d) => [
            new Date(`${d.dia}T12:00:00`).toLocaleDateString("pt-BR"),
            d.previstoMin ? hhmm(d.previstoMin) : "—",
            hhmm(d.trabalhadoMin),
            d.extrasPorFaixa.length ? hhmm(d.extrasPorFaixa.reduce((s, f) => s + f.minutos, 0)) : "—",
            d.noturnasMin ? hhmm(d.noturnasMin) : "—",
            [
              d.marcacoesImpares ? "marcação ímpar" : "",
              d.semMarcacao ? "sem marcação" : "",
              d.intervaloSuprimidoMin ? `intervalo ${hhmm(d.intervaloSuprimidoMin)} a menos` : "",
              d.ehFeriado ? "feriado" : "",
            ].filter(Boolean).join(" · ") || "—",
          ]),
        })),
      ],
      filename: `espelho-de-ponto-${competencia}`,
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Espelho e fechamento</h1>
          <p className="text-sm text-muted-foreground">
            O que cada um trabalhou no mês, apurado a partir das batidas e dos ajustes aprovados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" onClick={() => exportar("pdf")} disabled={!apuracao.length}>
            <FileDown className="mr-2 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={() => exportar("xlsx")} disabled={!apuracao.length}>
            <FileDown className="mr-2 h-4 w-4" /> Planilha
          </Button>
        </div>
      </div>

      {fechado ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-emerald-500/40 bg-emerald-50/50 p-4 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-emerald-600" />
            <span>
              Mês fechado em {new Date(fechamento!.fechado_em!).toLocaleDateString("pt-BR")}. Os números
              não mudam mais, mesmo que alguém bata ponto com data retroativa.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Motivo para reabrir"
              value={motivoReabertura}
              onChange={(e) => setMotivoReabertura(e.target.value)}
              className="w-56"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!motivoReabertura.trim() || reabrir.isPending}
              onClick={async () => {
                await reabrir.mutateAsync(motivoReabertura.trim());
                setMotivoReabertura("");
                toast.success("Mês reaberto. A reabertura ficou registrada com seu nome e o motivo.");
              }}
            >
              <LockOpen className="mr-2 h-4 w-4" /> Reabrir
            </Button>
          </div>
        </Card>
      ) : (
        pendencias.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-50/50 p-4 dark:bg-amber-950/20">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              {pendencias.length} {pendencias.length === 1 ? "pendência" : "pendências"} antes de fechar
            </p>
            <ul className="space-y-0.5 text-sm text-muted-foreground">
              {pendencias.slice(0, 8).map((p, i) => (
                <li key={i}>
                  {new Date(`${p.dia}T12:00:00`).toLocaleDateString("pt-BR")} · {p.nome} · {p.problema}
                </li>
              ))}
              {pendencias.length > 8 && <li>e mais {pendencias.length - 8}…</li>}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Dia com número ímpar de marcações é o defeito que a fiscalização pune. Corrija por ajuste,
              em Ajustes, para a marcação original continuar visível.
            </p>
          </Card>
        )
      )}

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : apuracao.length === 0 ? (
        <Card className="py-16 text-center text-muted-foreground">
          Nenhuma batida nesta competência.
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {apuracao.map((c) => (
              <Card key={c.colaborador_id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
                  <p className="font-medium">{c.nome}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.totais.map((t) => (
                      <Badge key={t.rubrica} variant="secondary" className="text-[11px]">
                        {rotuloRubrica(t.rubrica)}: {t.dias ? `${t.dias}` : hhmm(t.minutos)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Dia</TableHead>
                      <TableHead className="text-right">Previsto</TableHead>
                      <TableHead className="text-right">Trabalhado</TableHead>
                      <TableHead className="text-right">Extra</TableHead>
                      <TableHead className="text-right">Noturno</TableHead>
                      <TableHead>Observação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.dias.map((d) => {
                      const extra = d.extrasPorFaixa.reduce((s, f) => s + f.minutos, 0);
                      return (
                        <TableRow key={d.dia} className={d.marcacoesImpares ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                          <TableCell className="tabular-nums">
                            {new Date(`${d.dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" })}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{d.previstoMin ? hhmm(d.previstoMin) : "·"}</TableCell>
                          <TableCell className="text-right tabular-nums">{hhmm(d.trabalhadoMin)}</TableCell>
                          <TableCell className="text-right tabular-nums">{extra ? hhmm(extra) : "·"}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.noturnasMin ? hhmm(d.noturnasMin) : "·"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {d.marcacoesImpares && "marcação ímpar · "}
                            {d.semMarcacao && "sem marcação · "}
                            {d.intervaloSuprimidoMin > 0 && `intervalo ${hhmm(d.intervaloSuprimidoMin)} a menos · `}
                            {d.ehFeriado && "feriado · "}
                            {d.atrasoMin > 0 && `atraso ${hhmm(d.atrasoMin)}`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            ))}
          </div>

          {!fechado && (
            <div className="flex justify-end">
              <Button
                disabled={fechar.isPending}
                onClick={async () => {
                  await fechar.mutateAsync(apuracao);
                  toast.success("Mês fechado. Os totais ficaram gravados para a contabilidade.");
                }}
              >
                {fechar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Fechar {competencia}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
