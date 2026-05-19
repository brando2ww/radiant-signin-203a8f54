import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Trash2, Database, FileJson, FileSpreadsheet } from "lucide-react";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { toLocalDateStr } from "@/lib/date";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DataSection() {
  const { user } = useAuth();
  const [exportRange, setExportRange] = useState<DateRange | undefined>();
  const [cleanDays, setCleanDays] = useState(90);

  const { data: stats } = useQuery({
    queryKey: ["settings-stats", user?.id],
    queryFn: async () => {
      const [checklists, schedules, operators, executions] = await Promise.all([
        supabase.from("checklists").select("*", { count: "exact", head: true }).eq("user_id", user!.id),
        supabase.from("checklist_schedules").select("*", { count: "exact", head: true }).eq("user_id", user!.id),
        supabase.from("checklist_operators").select("*", { count: "exact", head: true }).eq("user_id", user!.id),
        supabase.from("checklist_executions").select("*", { count: "exact", head: true }).eq("user_id", user!.id),
      ]);
      return {
        checklists: checklists.count || 0,
        schedules: schedules.count || 0,
        operators: operators.count || 0,
        executions: executions.count || 0,
      };
    },
    enabled: !!user?.id,
  });

  const exportJSON = async () => {
    try {
      const [checklists, schedules, operators] = await Promise.all([
        supabase.from("checklists").select("*, checklist_items(*)").eq("user_id", user!.id),
        supabase.from("checklist_schedules").select("*").eq("user_id", user!.id),
        supabase.from("checklist_operators").select("*").eq("user_id", user!.id),
      ]);
      const blob = new Blob([JSON.stringify({ checklists: checklists.data, schedules: schedules.data, operators: operators.data }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `velara-backup-${toLocalDateStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Dados exportados com sucesso!" });
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    }
  };

  const exportCSV = async () => {
    if (!exportRange?.from || !exportRange?.to) return;
    try {
      const { data } = await supabase.from("checklist_executions")
        .select("*, checklists(name), checklist_operators(name)")
        .eq("user_id", user!.id)
        .gte("execution_date", toLocalDateStr(exportRange.from))
        .lte("execution_date", toLocalDateStr(exportRange.to));
      if (!data?.length) { toast({ title: "Nenhum dado no período" }); return; }
      const headers = "Data,Checklist,Operador,Status,Score,Início,Conclusão\n";
      const rows = data.map((r: any) =>
        `${r.execution_date},${r.checklists?.name || ""},${r.checklist_operators?.name || ""},${r.status},${r.score || ""},${r.started_at || ""},${r.completed_at || ""}`
      ).join("\n");
      const blob = new Blob([headers + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `execucoes-${toLocalDateStr(exportRange.from)}-${toLocalDateStr(exportRange.to)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV exportado!" });
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Checklists", value: stats.checklists, icon: Database },
            { label: "Agendamentos", value: stats.schedules, icon: Database },
            { label: "Colaboradores", value: stats.operators, icon: Database },
            { label: "Execuções", value: stats.executions, icon: Database },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Export JSON */}
      <div className="space-y-2">
        <Button variant="outline" onClick={exportJSON}>
          <FileJson className="h-4 w-4 mr-2" /> Exportar todos os dados (JSON)
        </Button>
        <p className="text-xs text-muted-foreground">Checklists, agendamentos, execuções e colaboradores</p>
      </div>

      {/* Export CSV */}
      <div className="space-y-2 pt-3 border-t border-border">
        <Label className="text-sm font-semibold">Exportar histórico de execuções (CSV)</Label>
        <DatePickerWithRange date={exportRange} setDate={setExportRange} />
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!exportRange?.from || !exportRange?.to}>
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      {/* Clean history */}
      <div className="space-y-2 pt-3 border-t border-border">
        <Label className="text-sm font-semibold text-destructive">Limpar histórico</Label>
        <p className="text-xs text-muted-foreground">Apaga execuções com mais de X dias. Essa ação é irreversível.</p>
        <div className="flex items-center gap-2">
          <Input type="number" min={30} className="w-20 h-8 text-sm" value={cleanDays} onChange={(e) => setCleanDays(+e.target.value)} />
          <span className="text-xs text-muted-foreground">dias</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Limpar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso irá apagar todas as execuções com mais de {cleanDays} dias. Essa ação é irreversível.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => toast({ title: "Funcionalidade em desenvolvimento" })}>
                  Confirmar exclusão
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
