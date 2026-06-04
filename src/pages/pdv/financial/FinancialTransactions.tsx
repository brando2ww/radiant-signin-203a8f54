import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Zap } from "lucide-react";
import { QuickExpenseDialog } from "@/components/pdv/financial/QuickExpenseDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePDVFinancialTransactions, type TransactionFilters } from "@/hooks/use-pdv-financial-transactions";
import { FinancialStatsCards } from "@/components/pdv/financial/FinancialStatsCards";
import { PDVTransactionFilters } from "@/components/pdv/financial/PDVTransactionFilters";
import { PDVTransactionList } from "@/components/pdv/financial/PDVTransactionList";
import { PDVTransactionDialog } from "@/components/pdv/financial/PDVTransactionDialog";
import { MarkAsPaidDialog } from "@/components/pdv/financial/MarkAsPaidDialog";
import { PaymentFeesReport } from "@/components/pdv/financial/PaymentFeesReport";
import type { PDVFinancialTransaction } from "@/hooks/use-pdv-financial-transactions";

export default function FinancialTransactions() {
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [markAsPaidOpen, setMarkAsPaidOpen] = useState(false);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<PDVFinancialTransaction | undefined>();
  const [activeTab, setActiveTab] = useState('all');

  // Aplica o filtro da aba diretamente na query (server-side) para que
  // a contagem e a paginação fiquem consistentes.
  const effectiveFilters = useMemo<TransactionFilters>(() => {
    switch (activeTab) {
      case 'payable':
        return { ...filters, transaction_type: 'payable', status: ['pending'] };
      case 'receivable':
        return { ...filters, transaction_type: 'receivable', status: ['pending'] };
      case 'overdue':
        return { ...filters, overdue_only: true };
      case 'paid':
        return { ...filters, status: ['paid'] };
      default:
        return filters;
    }
  }, [filters, activeTab]);

  const {
    transactions,
    stats,
    isLoading,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    markAsPaid,
  } = usePDVFinancialTransactions(effectiveFilters);

  const handleEdit = (transaction: PDVFinancialTransaction) => {
    setSelectedTransaction(transaction);
    setDialogOpen(true);
  };

  const handleMarkAsPaid = (transaction: PDVFinancialTransaction) => {
    setSelectedTransaction(transaction);
    setMarkAsPaidOpen(true);
  };

  const handleSubmit = async (data: any) => {
    try {
      if (selectedTransaction) {
        await updateTransaction(data);
      } else {
        await createTransaction(data);
      }
    } catch (err: any) {
      // O dialog detecta a exceção e mantém aberto; o hook já mostra toast.
      throw err;
    }
  };

  const handleMarkAsPaidSubmit = async (data: any) => {
    try {
      await markAsPaid(data);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao registrar pagamento');
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao excluir lançamento');
    }
  };

  const handleNewTransaction = () => {
    setSelectedTransaction(undefined);
    setDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lançamentos Financeiros</h1>
          <p className="text-muted-foreground mt-1">
            Registre e gerencie todas as transações financeiras
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setQuickExpenseOpen(true)}>
            <Zap className="mr-2 h-4 w-4" />
            Despesa rápida
          </Button>
          <Button onClick={handleNewTransaction}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Lançamento
          </Button>
        </div>
      </div>

      <FinancialStatsCards stats={stats} />

      <PaymentFeesReport />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Refine sua busca de lançamentos</CardDescription>
        </CardHeader>
        <CardContent>
          <PDVTransactionFilters filters={filters} onFiltersChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transações</CardTitle>
          <CardDescription>Visualize e gerencie seus lançamentos</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">
                Todas ({transactions.length})
              </TabsTrigger>
              <TabsTrigger value="payable">
                A Pagar ({stats.pendingPayableCount})
              </TabsTrigger>
              <TabsTrigger value="receivable">
                A Receber ({stats.pendingReceivableCount})
              </TabsTrigger>
              <TabsTrigger value="overdue">
                Vencidas ({stats.overdueCount})
              </TabsTrigger>
              <TabsTrigger value="paid">
                Pagas
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {isLoading ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Carregando...</p>
                </div>
              ) : (
                <PDVTransactionList
                  transactions={transactions}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMarkAsPaid={handleMarkAsPaid}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <PDVTransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={selectedTransaction}
        onSubmit={handleSubmit}
      />

      <MarkAsPaidDialog
        open={markAsPaidOpen}
        onOpenChange={setMarkAsPaidOpen}
        transaction={selectedTransaction}
        onSubmit={handleMarkAsPaidSubmit}
      />

      <QuickExpenseDialog open={quickExpenseOpen} onOpenChange={setQuickExpenseOpen} />
    </div>
  );
}
