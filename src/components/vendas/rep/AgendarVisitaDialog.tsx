import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toLocalDateStr } from "@/lib/date";
import { useRepContext } from "./RepContext";

function proximaHora() {
  const h = Math.min(Math.max(new Date().getHours() + 1, 8), 20);
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * Agendar visita a um cliente, direto da ficha do cliente no app do representante. Grava em vendas_agenda; o banco
 * preenche o representante (quando quem grava é representante) e recusa cliente fora da carteira.
 */
export function AgendarVisitaDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  endereco,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  customerName: string;
  endereco?: string;
}) {
  const { ownerId, repId, isPreview } = useRepContext();
  const qc = useQueryClient();
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [titulo, setTitulo] = useState("");
  const [local, setLocal] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const agora = new Date();
    const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + (agora.getHours() >= 18 ? 1 : 0));
    setDia(toLocalDateStr(amanha));
    setHora(agora.getHours() >= 18 ? "09:00" : proximaHora());
    setTitulo(`Visita · ${customerName}`);
    setLocal(endereco ?? "");
    setObs("");
  }, [open, customerName, endereco]);

  const salvar = async () => {
    if (!dia || !hora) {
      toast.error("Informe o dia e a hora da visita.");
      return;
    }
    const inicio = new Date(`${dia}T${hora}:00`);
    if (Number.isNaN(inicio.getTime())) {
      toast.error("Data ou hora inválida.");
      return;
    }
    if (isPreview && !repId) {
      toast.error("Escolha um representante na barra de prévia para agendar em nome dele.");
      return;
    }
    setSalvando(true);
    try {
      const fim = new Date(inicio.getTime() + 60 * 60 * 1000);
      const linha: Record<string, unknown> = {
        user_id: ownerId,
        customer_id: customerId,
        kind: "visita",
        title: titulo.trim() || `Visita · ${customerName}`,
        starts_at: inicio.toISOString(),
        ends_at: fim.toISOString(),
        all_day: false,
        location: local.trim() || null,
        notes: obs.trim() || null,
      };
      // Representante: o banco preenche com ele. Na prévia do dono, vai em nome do representante escolhido.
      if (isPreview) linha.representative_id = repId;
      const { error } = await supabase.from("vendas_agenda" as any).insert(linha);
      if (error) throw error;
      toast.success("Visita agendada.");
      qc.invalidateQueries({ queryKey: ["vendas-agenda"] });
      qc.invalidateQueries({ queryKey: ["vendas-rep-cliente-historico"] });
      onOpenChange(false);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      toast.error(msg.includes("carteira") ? msg : "Não foi possível agendar a visita.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-left">
          <DialogTitle>Agendar visita</DialogTitle>
          <DialogDescription className="truncate">{customerName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rep-visita-dia">Dia</Label>
              <Input id="rep-visita-dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-visita-hora">Hora</Label>
              <Input id="rep-visita-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-visita-titulo">Título</Label>
            <Input id="rep-visita-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-visita-local">Local</Label>
            <Input id="rep-visita-local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Endereço da visita" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-visita-obs">Observações</Label>
            <Textarea id="rep-visita-obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} placeholder="O que levar, o que conversar..." />
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button className="h-11 flex-1 sm:flex-none" onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
