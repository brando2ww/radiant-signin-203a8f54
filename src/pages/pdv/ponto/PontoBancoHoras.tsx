import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { usePontoColaboradores } from "@/hooks/use-ponto";
import { useApuracao, usePerfilJornada } from "@/hooks/use-ponto-jornada";
import { useBancoDeHoras } from "@/hooks/use-ponto-banco";
import { hhmm } from "@/lib/ponto/calculo";

const mesAtual = () => new Date().toISOString().slice(0, 7);

const PRAZO: Record<string, string> = {
  mensal: "no mesmo mês",
  quadrimestral: "em 4 meses",
  semestral: "em 6 meses",
  anual: "em 12 meses",
};

export default function PontoBancoHoras() {
  const [competencia, setCompetencia] = useState(mesAtual);
  const { colaboradores } = usePontoColaboradores();
  const { perfil } = usePerfilJornada();
  const { data: apuracao = [] } = useApuracao(competencia);
  const { saldos, isLoading, lancarDoMes, lancando } = useBancoDeHoras(competencia);

  const nomeDe = (id: string) => colaboradores.find((c) => c.id === id)?.nome ?? "·";
  const periodo = (perfil as any)?.periodo_banco ?? "semestral";

  const previa = useMemo(
    () =>
      apuracao.map((c) => ({
        colaborador_id: c.colaborador_id,
        nome: c.nome,
        credito: c.totais.filter((t) => t.rubrica.startsWith("extra_")).reduce((s, t) => s + t.minutos, 0),
        debito: c.totais.find((t) => t.rubrica === "faltas_horas")?.minutos ?? 0,
      })),
    [apuracao],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Banco de horas</h1>
          <p className="text-sm text-muted-foreground">
            Cada crédito tem data de validade e o mais antigo é consumido primeiro. Prazo atual:
            compensar {PRAZO[periodo]}.
          </p>
        </div>
        <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-40" />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Saldo de cada um</p>
          <Button
            size="sm"
            variant="outline"
            disabled={!previa.length || lancando}
            onClick={async () => {
              await lancarDoMes(previa);
              toast.success("Horas do mês lançadas no banco");
            }}
          >
            {lancando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lançar as horas de {competencia}
          </Button>
        </div>

        {isLoading ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : saldos.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Scale className="mx-auto mb-2 h-7 w-7" />
            Nada lançado ainda. O banco começa quando você lançar as horas de um mês fechado.
          </div>
        ) : (
          <ul className="divide-y">
            {saldos.map((s) => (
              <li key={s.colaborador_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{nomeDe(s.colaborador_id)}</span>
                <div className="flex items-center gap-3">
                  {s.aVencer > 0 && (
                    <Badge variant="outline" className="border-amber-500/50 text-[11px] text-amber-600">
                      {hhmm(s.aVencer)} vencem em 30 dias
                    </Badge>
                  )}
                  <span className={`tabular-nums font-medium ${s.saldo < 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {s.saldo >= 0 ? "+" : ""}{hhmm(s.saldo)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <p className="mb-2 font-medium">O que entraria com o mês atual</p>
        {previa.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada apurado nesta competência.</p>
        ) : (
          <ul className="divide-y text-sm">
            {previa.map((p) => (
              <li key={p.colaborador_id} className="flex items-center justify-between py-1.5">
                <span>{p.nome}</span>
                <span className="tabular-nums text-muted-foreground">
                  {p.credito ? `+${hhmm(p.credito)}` : "·"} {p.debito ? `· −${hhmm(p.debito)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Lançar no banco é uma decisão: a mesma hora extra ou vai para o banco, ou é paga na folha.
          Nunca as duas.
        </p>
      </Card>
    </div>
  );
}
