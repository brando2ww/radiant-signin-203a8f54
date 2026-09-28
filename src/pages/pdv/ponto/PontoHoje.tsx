import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Camera, Clock, Loader2, MapPin, CloudOff, Users } from "lucide-react";
import { usePontoColaboradores, usePontoDoDia, urlDaSelfie } from "@/hooks/use-ponto";
import { usePontoSaude } from "@/hooks/use-ponto-saude";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const hoje = () => new Date().toISOString().slice(0, 10);

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function PontoHoje() {
  const [dia, setDia] = useState(hoje);
  const [foto, setFoto] = useState<{ url: string; quem: string; hora: string } | null>(null);
  const { data: marcacoes = [], isLoading } = usePontoDoDia(dia);
  const { colaboradores } = usePontoColaboradores();
  const { data: saude } = usePontoSaude();

  const porColaborador = useMemo(() => {
    const mapa = new Map<string, typeof marcacoes>();
    for (const m of marcacoes) {
      const lista = mapa.get(m.colaborador_id) ?? [];
      lista.push(m);
      mapa.set(m.colaborador_id, lista);
    }
    return mapa;
  }, [marcacoes]);

  const nomeDe = (id: string) => colaboradores.find((c) => c.id === id)?.nome ?? "Colaborador";

  // "Quem ainda não bateu hoje" decide alguma coisa; "quem está trabalhando
  // agora" o gerente vê olhando o salão.
  const faltando = useMemo(
    () => colaboradores.filter((c) => c.ativo && !porColaborador.has(c.id)),
    [colaboradores, porColaborador],
  );

  const foraDaArea = marcacoes.filter((m) => m.dentro_raio === false).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ponto do dia</h1>
          <p className="text-sm text-muted-foreground">Batidas registradas, na ordem em que aconteceram.</p>
        </div>
        <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="w-44" />
      </div>

      {saude && (saude.jornadasAbertas.length > 0 || !saude.relogioOk) && dia === hoje() && (
        <Card className="space-y-1 border-amber-500/40 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/20">
          {saude.jornadasAbertas.length > 0 && (
            <p>
              <strong>
                {saude.jornadasAbertas.length === 1 ? "1 jornada aberta" : `${saude.jornadasAbertas.length} jornadas abertas`}
              </strong>{" "}
              agora: {saude.jornadasAbertas.map((id) => nomeDe(id)).join(", ")} entrou e ainda não
              registrou saída. Resolva hoje, não no fechamento.
            </p>
          )}
          {!saude.relogioOk && (
            <p className="text-destructive">
              O relógio do servidor está {Math.round(Math.abs(saude.desvioMs) / 1000)} segundos fora
              do horário real. Acima de 30 segundos, o registro perde validade.
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Batidas</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{marcacoes.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pessoas que bateram</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{porColaborador.size}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fora da área</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${foraDaArea ? "text-amber-600" : ""}`}>
            {foraDaArea}
          </p>
        </Card>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : marcacoes.length === 0 ? (
        <Card className="py-16 text-center">
          <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma batida neste dia</p>
          <p className="text-sm text-muted-foreground">
            Cadastre os colaboradores e envie o link de cada um para começar.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...porColaborador.entries()].map(([colaboradorId, batidas]) => (
            <Card key={colaboradorId} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium">{nomeDe(colaboradorId)}</p>
                <span className="text-xs text-muted-foreground">
                  {batidas.length} {batidas.length === 1 ? "batida" : "batidas"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[...batidas].reverse().map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!m.selfie_path}
                    onClick={async () => {
                      if (!m.selfie_path) return;
                      const url = await urlDaSelfie(m.selfie_path);
                      if (url) setFoto({ url, quem: nomeDe(colaboradorId), hora: hora(m.marcado_em) });
                    }}
                    className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm enabled:hover:border-primary/40"
                  >
                    <span className="font-medium tabular-nums">{hora(m.marcado_em)}</span>
                    <span className="text-[11px] text-muted-foreground">nº {m.nsr}</span>
                    {m.dentro_raio === false && (
                      <Badge variant="outline" className="gap-1 border-amber-500/50 text-[10px] text-amber-600">
                        <MapPin className="h-3 w-3" />
                        {m.distancia_m != null ? `${Math.round(m.distancia_m)} m` : "fora"}
                      </Badge>
                    )}
                    {m.origem_offline && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <CloudOff className="h-3 w-3" /> offline
                      </Badge>
                    )}
                    {m.selfie_path && <Camera className="h-3 w-3 text-muted-foreground" />}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!foto} onOpenChange={(o) => !o && setFoto(null)}>
        <DialogContent className="max-w-xs p-3">
          {foto && (
            <>
              <img src={foto.url} alt="" className="w-full rounded-md" />
              <p className="mt-2 text-center text-sm">
                {foto.quem} · {foto.hora}
              </p>
              <p className="text-center text-[11px] text-muted-foreground">
                A foto fica guardada por 90 dias e não abre por link público.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {dia === hoje() && faltando.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4" /> Ainda não bateram hoje
          </p>
          <div className="flex flex-wrap gap-2">
            {faltando.map((c) => (
              <Badge key={c.id} variant="secondary">{c.nome}</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
