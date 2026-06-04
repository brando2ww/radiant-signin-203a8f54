import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
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

  const {
    transactions,
    stats,
    isLoading,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    markAsPaid,
  } = usePDVFinancialTransactions(filters);

  const handleEdit = (transaction: PDVFinancialTransaction) => {
    setSelectedTransaction(transaction);
    setDialogOpen(true);
  };

  const handleMarkAsPaid = (transaction: PDVFinancialTransaction) => {
    setSelectedTransaction(transaction);
    setMarkAsPaidOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (selectedTransaction) {
      await updateTransaction(data);
    } else {
      await createTransaction(data);
    }
  };

  const handleMarkAsPaidSubmit = async (data: any) => {
    await markAsPaid(data);
  };

  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
  };

  const handleNewTransaction = () => {
    setSelectedTransaction(undefined);
    setDialogOpen(true);
  };

  // Filter transactions based on active tab
  const filteredTransactions = transactions.filter((t) => {
    if (activeTab === 'payable') return t.transaction_type === 'payable' && t.status === 'pending';
    if (activeTab === 'receivable') return t.transaction_type === 'receivable' && t.status === 'pending';
    if (activeTab === 'overdue') return t.status === 'overdue' || (t.status === 'pending' && new Date(t.due_date) < new Date());
    if (activeTab === 'paid') return t.status === 'paid';
    return true;
  });

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
                  transactions={filteredTransactions}
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
