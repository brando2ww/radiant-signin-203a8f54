import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Thermometer, AlertOctagon, Clock, Check } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  byType: Record<string, number>;
  recent: {
    id: string;
    type: "temperatura_fora" | "item_critico" | "prazo_expirado";
    message: string;
    createdAt: string;
    checklistName: string | null;
  }[];
}

const TYPE_META: Record<string, { label: string; Icon: typeof Thermometer }> = {
  temperatura_fora: { label: "Temperatura fora da faixa", Icon: Thermometer },
  item_critico: { label: "Item crítico", Icon: AlertOctagon },
  prazo_expirado: { label: "Atraso", Icon: Clock },
};

export function AlertsPanel({ byType, recent }: Props) {
  const qc = useQueryClient();
  const ack = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("checklist_alerts")
        .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational-report"] });
      toast.success("Alerta reconhecido");
    },
    onError: (e: any) => toast.error(e.message || "Falha ao reconhecer"),
  });

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Alertas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(["temperatura_fora", "item_critico", "prazo_expirado"] as const).map((t) => {
            const meta = TYPE_META[t];
            const Icon = meta.Icon;
            return (
              <div key={t} className="rounded-md border border-border p-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div className="mt-1 text-2xl font-bold">{byType[t] || 0}</div>
                <div className="text-xs text-muted-foreground">{meta.label}</div>
              </div>
            );
          })}
        </div>

        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">Não reconhecidos recentes</div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhum alerta pendente.</p>
          ) : (
            recent.map((a) => {
              const meta = TYPE_META[a.type];
              const Icon = meta?.Icon || AlertOctagon;
              return (
                <div key={a.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                  <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{a.checklistName || meta?.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.message}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(a.createdAt), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => ack.mutate(a.id)}
                    disabled={ack.isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
