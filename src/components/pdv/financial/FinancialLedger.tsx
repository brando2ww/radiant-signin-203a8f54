import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useQueryClient } from "@tanstack/react-query";
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

interface Props {
  /** Trava o tipo: é o que transforma esta tela em Contas a Pagar/Receber. */
  lockedType?: "payable" | "receivable";
  title: string;
  subtitle: string;
}

/**
 * Base das três telas do financeiro.
 *
 * Contas a Pagar e Contas a Receber tinham tabela e formulário próprios
 * (`bills`), sem plano de contas, sem centro de custo e sem competência — e,
 * por isso, fora da DRE. Agora são a mesma tela de Lançamentos com o tipo
 * travado, sobre a mesma tabela.
 */
export function FinancialLedger({ lockedType, title, subtitle }: Props) {
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [markAsPaidOpen, setMarkAsPaidOpen] = useState(false);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<PDVFinancialTransaction | undefined>();
  const [activeTab, setActiveTab] = useState(lockedType ? 'open' : 'all');

  // Recorrente sem data de fim mantém um horizonte de 12 meses à frente.
  // Completar na abertura do módulo evita depender de cron e evita gerar
  // linhas para quem nunca usa o financeiro.
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();
  const jaEstendeu = useRef(false);
  useEffect(() => {
    if (!visibleUserId || jaEstendeu.current) return;
    jaEstendeu.current = true;
    supabase
      .rpc("pdv_extend_recurring_transactions", { _user_id: visibleUserId })
      .then(({ data, error }) => {
        if (error) return console.error("[financeiro] recorrências", error);
        if (Number(data) > 0) qc.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
      });
  }, [visibleUserId, qc]);

  // Aplica o filtro da aba diretamente na query (server-side) para que
  // a contagem e a paginação fiquem consistentes.
  const effectiveFilters = useMemo<TransactionFilters>(() => {
    const base = lockedType ? { ...filters, transaction_type: lockedType } : filters;
    switch (activeTab) {
      case 'open':
        return { ...base, status: ['pending'] };
      case 'payable':
        return { ...base, transaction_type: 'payable', status: ['pending'] };
      case 'receivable':
        return { ...base, transaction_type: 'receivable', status: ['pending'] };
      case 'overdue':
        return { ...base, overdue_only: true };
      case 'paid':
        return { ...base, status: ['paid'] };
      default:
        return base;
    }
  }, [filters, activeTab, lockedType]);

  const {
    transactions,
    stats,
    isLoading,
    createTransaction,
    updateTransaction,
    updateGroup,
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
      // Marcadores do diálogo, não colunas da tabela.
      const { __applyToGroup, __groupId, ...limpo } = data;
      if (selectedTransaction) {
        if (__applyToGroup && __groupId) {
          const { id, ...changes } = limpo;
          await updateGroup({ groupId: __groupId, changes });
        } else {
          await updateTransaction(limpo);
        }
      } else {
        await createTransaction(limpo);
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
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          {lockedType !== "receivable" && (
          <Button variant="outline" onClick={() => setQuickExpenseOpen(true)}>
            <Zap className="mr-2 h-4 w-4" />
            Despesa rápida
          </Button>
          )}
          <Button onClick={handleNewTransaction}>
            <Plus className="mr-2 h-4 w-4" />
            {lockedType === "receivable" ? "Nova Conta a Receber" : lockedType === "payable" ? "Nova Conta a Pagar" : "Novo Lançamento"}
          </Button>
        </div>
      </div>

      <FinancialStatsCards stats={stats} isLoading={isLoading} />

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
              {lockedType ? (
                <>
                  <TabsTrigger value="open">
                    Em aberto ({lockedType === "payable" ? stats.pendingPayableCount : stats.pendingReceivableCount})
                  </TabsTrigger>
                  <TabsTrigger value="overdue">Vencidas ({stats.overdueCount})</TabsTrigger>
                  <TabsTrigger value="paid">{lockedType === "payable" ? "Pagas" : "Recebidas"}</TabsTrigger>
                  <TabsTrigger value="all">Todas</TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger value="all">Todas ({transactions.length})</TabsTrigger>
                  <TabsTrigger value="payable">A Pagar ({stats.pendingPayableCount})</TabsTrigger>
                  <TabsTrigger value="receivable">A Receber ({stats.pendingReceivableCount})</TabsTrigger>
                  <TabsTrigger value="overdue">Vencidas ({stats.overdueCount})</TabsTrigger>
                  <TabsTrigger value="paid">Pagas</TabsTrigger>
                </>
              )}
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
        lockedType={lockedType}
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
