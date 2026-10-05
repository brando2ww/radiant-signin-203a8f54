import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBRL } from "@/lib/format";
import { usePagarComissoes, type ComissaoLinha } from "@/hooks/use-vendas-comissoes";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  comissoes: ComissaoLinha[];
  onPago?: () => void;
}

/**
 * Confirma o pagamento das comissões escolhidas: o banco lança UM pagamento por representante no contas a pagar
 * (já pago na data informada) e marca as comissões como pagas.
 */
export function PagarComissoesDialog({ open, onOpenChange, comissoes, onPago }: Props) {
  const pagar = usePagarComissoes();
  const [data, setData] = useState<Date>(new Date());
  const [calendario, setCalendario] = useState(false);

  useEffect(() => {
    if (open) setData(new Date());
  }, [open]);

  const porRep = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; total: number; qtd: number }>();
    for (const c of comissoes) {
      const atual = m.get(c.representative_id) ?? {
        id: c.representative_id,
        nome: c.vendas_representantes?.name || "Representante",
        total: 0,
        qtd: 0,
      };
      atual.total += Number(c.amount || 0);
      atual.qtd++;
      m.set(c.representative_id, atual);
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [comissoes]);
  const total = porRep.reduce((s, r) => s + r.total, 0);

  const confirmar = async () => {
    try {
      const r = await pagar.mutateAsync({ ids: comissoes.map((c) => c.id), data });
      const n = r?.payables?.length ?? porRep.length;
      toast.success(
        `${r?.paid ?? comissoes.length} ${comissoes.length === 1 ? "comissão paga" : "comissões pagas"} · ${n} ${n === 1 ? "lançamento" : "lançamentos"} no contas a pagar`,
      );
      onPago?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui registrar o pagamento.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !pagar.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como paga</DialogTitle>
          <DialogDescription>
            Vai para o contas a pagar um lançamento já pago por representante, na conta Comissões quando ela existe no
            plano de contas.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y rounded-md border text-sm">
          {porRep.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {r.qtd} {r.qtd === 1 ? "comissão" : "comissões"}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatBRL(r.total)}</span>
            </li>
          ))}
          {porRep.length > 1 && (
            <li className="flex items-center justify-between gap-3 bg-muted/40 p-3">
              <span className="font-medium">Total</span>
              <span className="font-semibold tabular-nums">{formatBRL(total)}</span>
            </li>
          )}
        </ul>

        <div className="space-y-2">
          <Label>Data do pagamento</Label>
          <Popover open={calendario} onOpenChange={setCalendario}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(data, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={data}
                onSelect={(d) => { if (d) { setData(d); setCalendario(false); } }}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pagar.isPending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pagar.isPending || comissoes.length === 0}>
            {pagar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar pagamento de {formatBRL(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
