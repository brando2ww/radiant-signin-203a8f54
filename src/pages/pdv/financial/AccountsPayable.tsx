import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBills } from "@/hooks/use-bills";
import { BillDialog } from "@/components/pdv/bills/BillDialog";
import { BillFilters } from "@/components/pdv/bills/BillFilters";
import { BillCard } from "@/components/pdv/bills/BillCard";
import { BillStats } from "@/components/pdv/bills/BillStats";
import { MarkAsPaidDialog } from "@/components/pdv/bills/MarkAsPaidDialog";
import { EmptyState } from "@/components/pdv/shared/EmptyState";
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
import { Inbox } from "lucide-react";
import type { Bill } from "@/hooks/use-bills";

export default function AccountsPayable() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [markAsPaidDialogOpen, setMarkAsPaidDialogOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);
  const [filters, setFilters] = useState({ search: "", status: "all", category: "all" });

  const billFilters = {
    type: "payable" as const,
    ...(filters.search && { search: filters.search }),
    ...(filters.status !== "all" && { status: filters.status as any }),
    ...(filters.category !== "all" && { category: filters.category }),
  };

  const { bills, stats, isLoading, createBill, updateBill, deleteBill, markAsPaid } = useBills(billFilters);

  const handleSave = async (data: any) => {
    if (selectedBill) await updateBill({ ...data, id: selectedBill.id });
    else await createBill(data);
  };

  const handleEdit = (bill: Bill) => { setSelectedBill(bill); setDialogOpen(true); };
  const handleDelete = (id: string) => {
    const bill = bills.find((b) => b.id === id);
    if (bill) setDeleteTarget(bill);
  };
  const confirmDelete = async () => {
    if (deleteTarget) {
      await deleteBill(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleMarkAsPaid = (bill: Bill) => { setSelectedBill(bill); setMarkAsPaidDialogOpen(true); };
  const handleMarkAsPaidConfirm = async (data: any) => {
    if (selectedBill) await markAsPaid({ id: selectedBill.id, ...data });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contas a Pagar</h1>
          <p className="text-muted-foreground mt-1">Gerencie suas despesas e pagamentos</p>
        </div>
        <Button onClick={() => { setSelectedBill(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Despesa
        </Button>
      </div>

      <BillStats
        totalPayable={stats?.totalPayable || 0}
        totalReceivable={stats?.totalReceivable || 0}
        overdue={stats?.overdue || 0}
        type="payable"
      />

      <BillFilters type="payable" filters={filters} onFiltersChange={setFilters} />

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))
        ) : bills.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nenhuma conta a pagar encontrada"
            description='Clique em "Nova Despesa" para adicionar.'
          />
        ) : (
          bills.map((bill) => (
            <BillCard key={bill.id} bill={bill} onEdit={handleEdit} onDelete={handleDelete} onMarkAsPaid={handleMarkAsPaid} />
          ))
        )}
      </div>

      <BillDialog open={dialogOpen} onOpenChange={setDialogOpen} bill={selectedBill} onSave={handleSave} type="payable" />

      <MarkAsPaidDialog
        open={markAsPaidDialogOpen}
        onOpenChange={setMarkAsPaidDialogOpen}
        bill={selectedBill}
        onConfirm={handleMarkAsPaidConfirm}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `"${deleteTarget.description}" será removida permanentemente.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
