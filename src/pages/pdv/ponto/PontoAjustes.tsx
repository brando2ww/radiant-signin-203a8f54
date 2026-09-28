import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { usePontoColaboradores } from "@/hooks/use-ponto";
import { useTratamentos } from "@/hooks/use-ponto-jornada";

const mesAtual = () => new Date().toISOString().slice(0, 7);

const TIPOS: Record<string, string> = {
  inclusao: "Marcação esquecida",
  desconsideracao: "Marcação indevida",
  ausencia: "Ausência justificada",
  abono: "Abono",
  banco_horas: "Banco de horas",
};

export default function PontoAjustes() {
  const [competencia, setCompetencia] = useState(mesAtual);
  const { colaboradores } = usePontoColaboradores();
  const { tratamentos, isLoading, decidir, criar } = useTratamentos(competencia);
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState<any>({ tipo: "inclusao" });

  const pendentes = useMemo(() => tratamentos.filter((t) => t.status === "pendente"), [tratamentos]);
  const decididos = useMemo(() => tratamentos.filter((t) => t.status !== "pendente"), [tratamentos]);
  const nomeDe = (id: string) => colaboradores.find((c) => c.id === id)?.nome ?? "·";

  const gravar = async () => {
    if (!novo.colaborador_id || !novo.dia_jornada || !novo.motivo?.trim()) return;
    await criar.mutateAsync({
      colaborador_id: novo.colaborador_id,
      dia_jornada: novo.dia_jornada,
      tipo: novo.tipo,
      horario: novo.hora ? `${novo.dia_jornada}T${novo.hora}:00` : null,
      motivo: novo.motivo.trim(),
    } as any);
    setAberto(false);
    setNovo({ tipo: "inclusao" });
    toast.success("Ajuste registrado. A marcação original continua no espelho.");
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ajustes de ponto</h1>
          <p className="text-sm text-muted-foreground">
            Correção nunca apaga a batida: entra como uma camada por cima, com motivo e autor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-40" />
          <Button onClick={() => setAberto(true)} disabled={!colaboradores.length}>
            <Plus className="mr-2 h-4 w-4" /> Novo ajuste
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          {pendentes.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Esperando sua decisão</p>
              {pendentes.map((t) => (
                <Card key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">
                      {nomeDe(t.colaborador_id)} · {new Date(`${t.dia_jornada}T12:00:00`).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {TIPOS[t.tipo] ?? t.tipo}
                      {t.horario ? ` às ${new Date(t.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                      {" · "}
                      {t.motivo}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline"
                      onClick={() => decidir.mutate({ id: t.id, status: "recusado" })}>
                      <X className="mr-1.5 h-3.5 w-3.5" /> Recusar
                    </Button>
                    <Button size="sm"
                      onClick={() => decidir.mutate({ id: t.id, status: "aprovado" })}>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Aprovar
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Histórico do mês</p>
            {decididos.length === 0 ? (
              <Card className="py-10 text-center text-sm text-muted-foreground">
                Nenhum ajuste nesta competência.
              </Card>
            ) : (
              <Card className="divide-y">
                {decididos.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span>
                      {new Date(`${t.dia_jornada}T12:00:00`).toLocaleDateString("pt-BR")} · {nomeDe(t.colaborador_id)} ·{" "}
                      <span className="text-muted-foreground">{TIPOS[t.tipo] ?? t.tipo}: {t.motivo}</span>
                    </span>
                    <Badge variant={t.status === "aprovado" ? "secondary" : "outline"}>{t.status}</Badge>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo ajuste</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Colaborador</Label>
              <Select value={novo.colaborador_id ?? ""} onValueChange={(v) => setNovo({ ...novo, colaborador_id: v })}>
                <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  {colaboradores.filter((c) => c.ativo).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Dia</Label>
                <Input type="date" value={novo.dia_jornada ?? ""} onChange={(e) => setNovo({ ...novo, dia_jornada: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Hora (se for inclusão)</Label>
                <Input type="time" value={novo.hora ?? ""} onChange={(e) => setNovo({ ...novo, hora: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={novo.tipo} onValueChange={(v) => setNovo({ ...novo, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo</Label>
              <Textarea rows={2} value={novo.motivo ?? ""} onChange={(e) => setNovo({ ...novo, motivo: e.target.value })} />
              <p className="text-[11px] text-muted-foreground">
                Obrigatório: é o que a fiscalização pede e o que aparece no espelho ao lado da
                marcação original.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={criar.isPending || !novo.colaborador_id || !novo.dia_jornada || !novo.motivo?.trim()}>
              {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
