import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { usePontoColaboradores } from "@/hooks/use-ponto";
import { useEscalas, usePerfilJornada } from "@/hooks/use-ponto-jornada";

const SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const diaVazio = (dia_semana: number) => ({
  dia_semana, entrada: "", saida: "", intervalo_min: 60, is_dsr: dia_semana === 0,
});

export default function PontoEscalas() {
  const { colaboradores } = usePontoColaboradores();
  const { escalas, isLoading, salvar } = useEscalas();
  const { perfil, salvar: salvarPerfil } = usePerfilJornada();

  const [aberto, setAberto] = useState(false);
  const [colaboradorId, setColaboradorId] = useState("");
  const [vigencia, setVigencia] = useState(() => new Date().toISOString().slice(0, 10));
  const [dias, setDias] = useState(() => SEMANA.map((_, i) => diaVazio(i)));
  const [perfilAberto, setPerfilAberto] = useState(false);

  const abrirNova = () => {
    setColaboradorId(colaboradores[0]?.id ?? "");
    setDias(SEMANA.map((_, i) => (i === 0 ? { ...diaVazio(i), is_dsr: true } : { ...diaVazio(i), entrada: "18:00", saida: "23:00", intervalo_min: 0 })));
    setAberto(true);
  };

  const gravar = async () => {
    if (!colaboradorId) return;
    await salvar.mutateAsync({
      escala: { colaborador_id: colaboradorId, vigencia_inicio: vigencia },
      dias: dias.map((d) => ({
        dia_semana: d.dia_semana,
        entrada: d.is_dsr ? null : d.entrada || null,
        saida: d.is_dsr ? null : d.saida || null,
        intervalo_min: Number(d.intervalo_min) || 0,
        is_dsr: d.is_dsr,
      })),
    });
    setAberto(false);
    toast.success("Escala salva");
  };

  const nomeDe = (id: string) => colaboradores.find((c) => c.id === id)?.nome ?? "·";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Escalas</h1>
          <p className="text-sm text-muted-foreground">
            O horário previsto de cada um. Sem ele, todo minuto a mais virava hora extra.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPerfilAberto(true)}>Regras de cálculo</Button>
          <Button onClick={abrirNova} disabled={!colaboradores.length}>
            <Plus className="mr-2 h-4 w-4" /> Nova escala
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : escalas.length === 0 ? (
        <Card className="py-16 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma escala cadastrada</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            O ponto funciona sem escala, mas o cálculo de hora extra não: a tolerância legal compara a
            batida com o horário previsto.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {escalas.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">{nomeDe(e.colaborador_id)}</p>
                <Badge variant="secondary" className="text-[11px]">
                  desde {new Date(`${e.vigencia_inicio}T12:00:00`).toLocaleDateString("pt-BR")}
                </Badge>
              </div>
              <div className="space-y-0.5 text-sm text-muted-foreground">
                {(e.dias ?? []).sort((a, b) => a.dia_semana - b.dia_semana).map((d) => (
                  <div key={d.dia_semana} className="flex justify-between">
                    <span>{SEMANA[d.dia_semana]}</span>
                    <span className="tabular-nums">
                      {d.is_dsr ? "folga" : `${d.entrada ?? "·"} às ${d.saida ?? "·"}${d.intervalo_min ? ` · ${d.intervalo_min} min de intervalo` : ""}`}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Escala */}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nova escala</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Colaborador</Label>
              <Select value={colaboradorId} onValueChange={setColaboradorId}>
                <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  {colaboradores.filter((c) => c.ativo).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vale a partir de</Label>
              <Input type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
            </div>
          </div>

          <div className="mt-2 space-y-2">
            {dias.map((d, i) => (
              <div key={d.dia_semana} className="flex flex-wrap items-center gap-3 rounded-md border p-2">
                <span className="w-20 text-sm font-medium">{SEMANA[d.dia_semana]}</span>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!d.is_dsr}
                    onCheckedChange={(v) => setDias(dias.map((x, j) => (j === i ? { ...x, is_dsr: !v } : x)))}
                  />
                  <span className="text-xs text-muted-foreground">{d.is_dsr ? "folga" : "trabalha"}</span>
                </div>
                {!d.is_dsr && (
                  <>
                    <Input type="time" className="w-28" value={d.entrada}
                      onChange={(e) => setDias(dias.map((x, j) => (j === i ? { ...x, entrada: e.target.value } : x)))} />
                    <span className="text-xs text-muted-foreground">às</span>
                    <Input type="time" className="w-28" value={d.saida}
                      onChange={(e) => setDias(dias.map((x, j) => (j === i ? { ...x, saida: e.target.value } : x)))} />
                    <Input type="number" className="w-24" min={0} step={15} value={d.intervalo_min}
                      onChange={(e) => setDias(dias.map((x, j) => (j === i ? { ...x, intervalo_min: Number(e.target.value) } : x)))} />
                    <span className="text-xs text-muted-foreground">min de intervalo</span>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Jornada que vira a meia-noite é normal aqui: saída 02:00 com entrada 18:00 conta como o
            mesmo dia de trabalho.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={!colaboradorId || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regras de cálculo */}
      <Dialog open={perfilAberto} onOpenChange={setPerfilAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Regras de cálculo</DialogTitle></DialogHeader>
          {perfil && (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-500/40 bg-amber-50/50 p-3 text-xs text-muted-foreground dark:bg-amber-950/20">
                Estes valores são o <strong>piso da CLT</strong>. Quando a convenção coletiva da
                categoria chegar, ela entra aqui: a do setor costuma pagar 50% nas duas primeiras
                horas e mais que isso acima, o que muda o cálculo de todo mundo.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Domingo e feriado (%)</Label>
                  <Input type="number" defaultValue={perfil.pct_domingo_feriado}
                    onBlur={(e) => salvarPerfil.mutate({ id: (perfil as any).id, pct_domingo_feriado: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Adicional noturno (%)</Label>
                  <Input type="number" defaultValue={perfil.pct_noturno}
                    onBlur={(e) => salvarPerfil.mutate({ id: (perfil as any).id, pct_noturno: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Noturno começa</Label>
                  <Input type="time" defaultValue={perfil.noturno_inicio}
                    onBlur={(e) => salvarPerfil.mutate({ id: (perfil as any).id, noturno_inicio: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Noturno termina</Label>
                  <Input type="time" defaultValue={perfil.noturno_fim}
                    onBlur={(e) => salvarPerfil.mutate({ id: (perfil as any).id, noturno_fim: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Hora noturna reduzida</p>
                  <p className="text-xs text-muted-foreground">
                    52 minutos e 30 segundos valem uma hora (art. 73 da CLT).
                  </p>
                </div>
                <Switch
                  defaultChecked={perfil.noturno_hora_reduzida}
                  onCheckedChange={(v) => salvarPerfil.mutate({ id: (perfil as any).id, noturno_hora_reduzida: v })}
                />
              </div>
              <div className="rounded-md border p-3 text-xs text-muted-foreground">
                Tolerância travada em {perfil.tolerancia_extremo_min} minutos por marcação e{" "}
                {perfil.tolerancia_dia_min} no dia. É o teto legal, e passar disso conta o tempo
                inteiro, não só o excedente.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
