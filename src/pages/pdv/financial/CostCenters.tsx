import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Target, Pencil, Trash2, CalendarIcon } from "lucide-react";
import { usePDVCostCenters, PDVCostCenter } from "@/hooks/use-pdv-cost-centers";
import { usePDVFinancialTransactions } from "@/hooks/use-pdv-financial-transactions";
import { Badge } from "@/components/ui/badge";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { CostCenterQuickDialog } from "@/components/pdv/CostCenterQuickDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CostCenters() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const { costCenters, isLoading, createCostCenter, isCreating, updateCostCenter, isUpdating, deleteCostCenter } = usePDVCostCenters();
  const { transactions, isLoading: isLoadingTx } = usePDVFinancialTransactions({
    transaction_type: "payable",
    status: ["paid"],
    due_date_from: startOfMonth(selectedMonth),
    due_date_to: endOfMonth(selectedMonth),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<PDVCostCenter | null>(null);
  const [deletingCenter, setDeletingCenter] = useState<PDVCostCenter | null>(null);

  const spendByCenter = useMemo(() => {
    const map: Record<string, number> = {};
    (transactions || []).forEach((t: any) => {
      if (t.cost_center_id) {
        map[t.cost_center_id] = (map[t.cost_center_id] || 0) + Number(t.amount);
      }
    });
    return map;
  }, [transactions]);

  const totalSpend = Object.values(spendByCenter).reduce((s, v) => s + v, 0);

  const handleDelete = async () => {
    if (!deletingCenter) return;
    await deleteCostCenter(deletingCenter.id);
    setDeletingCenter(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Centros de Custo</h1>
          <p className="text-muted-foreground mt-1">Rastreie despesas por setor ou departamento</p>
        </div>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedMonth}
                onSelect={(d) => d && setSelectedMonth(d)}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Centro de Custo
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total de Centros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{costCenters.length}</div>
            <p className="text-xs text-muted-foreground mt-1">ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Total Gasto — {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingTx ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold text-destructive">{fmt(totalSpend)}</div>
                <p className="text-xs text-muted-foreground mt-1">despesas pagas</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Sem Centro de Custo</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingTx ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold text-warning">
                  {(transactions || []).filter((t: any) => !t.cost_center_id).length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">lançamentos sem classificação</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Centros de Custo Cadastrados</CardTitle>
          <CardDescription>Despesas pagas em {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : costCenters.length > 0 ? (
            <div className="space-y-2">
              {costCenters.map((center) => (
                <div
                  key={center.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <Target className="h-5 w-5 text-primary" />
                    <span className="font-medium">{center.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{fmt(spendByCenter[center.id] || 0)}</span>
                    <Badge variant="outline">Ativo</Badge>
                    <Button variant="ghost" size="icon" onClick={() => setEditingCenter(center)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletingCenter(center)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum centro de custo cadastrado</p>
              <p className="text-sm mt-2">Organize suas despesas por setor</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Criar */}
      <CostCenterQuickDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (name) => { await createCostCenter(name); }}
        isSubmitting={isCreating}
      />

      {/* Dialog Editar */}
      <CostCenterQuickDialog
        open={!!editingCenter}
        onOpenChange={(open) => { if (!open) setEditingCenter(null); }}
        onSubmit={async (name) => {
          if (editingCenter) await updateCostCenter({ id: editingCenter.id, name });
        }}
        isSubmitting={isUpdating}
        initialName={editingCenter?.name}
        title="Editar Centro de Custo"
      />

      {/* AlertDialog Excluir */}
      <AlertDialog open={!!deletingCenter} onOpenChange={(open) => { if (!open) setDeletingCenter(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir centro de custo?</AlertDialogTitle>
            <AlertDialogDescription>
              O centro de custo "{deletingCenter?.name}" será desativado. Essa ação pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
