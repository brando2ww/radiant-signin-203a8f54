import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp } from "lucide-react";
import { useApuracao } from "@/hooks/use-ponto-jornada";
import { useFaturamentoPorHora } from "@/hooks/use-ponto-operacao";
import { hhmm } from "@/lib/ponto/calculo";

const mesAtual = () => new Date().toISOString().slice(0, 7);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O que só quem é o caixa do restaurante consegue mostrar: gente trabalhando
 * contra dinheiro entrando, na mesma hora do dia.
 *
 * Aqui não há salário: o módulo entrega HORAS. O que cruzamos é hora trabalhada
 * com faturamento, que já está no banco, e isso basta para o dono enxergar a
 * hora que não se paga.
 */
export default function PontoOperacao() {
  const [competencia, setCompetencia] = useState(mesAtual);
  const { data: apuracao = [], isLoading } = useApuracao(competencia);
  const { porHora, total, isLoading: carregandoVendas } = useFaturamentoPorHora(competencia);

  const horasTrabalhadas = useMemo(
    () => apuracao.reduce((s, c) => s + c.dias.reduce((d, x) => d + x.trabalhadoMin, 0), 0),
    [apuracao],
  );

  const horasExtras = useMemo(
    () =>
      apuracao.reduce(
        (s, c) => s + c.totais.filter((t) => t.rubrica.startsWith("extra_")).reduce((a, t) => a + t.minutos, 0),
        0,
      ),
    [apuracao],
  );

  const maiorMovimento = useMemo(
    () => [...porHora].sort((a, b) => b.valor - a.valor).slice(0, 5),
    [porHora],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ponto e operação</h1>
          <p className="text-sm text-muted-foreground">
            Hora trabalhada contra dinheiro entrando. É o cruzamento que só existe aqui, porque o
            ponto e o caixa são o mesmo sistema.
          </p>
        </div>
        <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-40" />
      </div>

      {isLoading || carregandoVendas ? (
        <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Horas trabalhadas</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{hhmm(horasTrabalhadas)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Horas extras</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${horasExtras ? "text-amber-600" : ""}`}>
                {hhmm(horasExtras)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Faturamento do mês</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{brl(total)}</p>
            </Card>
          </div>

          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 font-medium">
              <TrendingUp className="h-4 w-4" /> As horas que mais vendem
            </p>
            {porHora.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem vendas nesta competência.</p>
            ) : (
              <div className="space-y-1.5">
                {maiorMovimento.map((h) => (
                  <div key={h.hora} className="flex items-center gap-3">
                    <span className="w-14 text-sm tabular-nums">{String(h.hora).padStart(2, "0")}h</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(h.valor / maiorMovimento[0].valor) * 100}%` }}
                      />
                    </div>
                    <span className="w-28 text-right text-sm tabular-nums">{brl(h.valor)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              Use isto para montar a escala: colocar gente onde o dinheiro entra, e não onde a
              semana passada pareceu cheia.
            </p>
          </Card>

          <Card className="p-4">
            <p className="mb-2 font-medium">Horas por pessoa no mês</p>
            <ul className="divide-y text-sm">
              {apuracao.map((c) => {
                const trabalhadas = c.dias.reduce((s, d) => s + d.trabalhadoMin, 0);
                const extras = c.totais.filter((t) => t.rubrica.startsWith("extra_")).reduce((s, t) => s + t.minutos, 0);
                return (
                  <li key={c.colaborador_id} className="flex items-center justify-between py-2">
                    <span>{c.nome}</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      {extras > 0 && (
                        <Badge variant="outline" className="border-amber-500/50 text-[11px] text-amber-600">
                          {hhmm(extras)} de extra
                        </Badge>
                      )}
                      <span className="text-muted-foreground">{hhmm(trabalhadas)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
