import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { formatBRL } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  usePDVFinancialTransactions,
  type PDVFinancialTransaction,
  type TransactionFilters,
} from "@/hooks/use-pdv-financial-transactions";
import { LedgerSummary } from "@/components/pdv/financial/LedgerSummary";
import { LedgerPeriodBar, descreverPeriodo } from "@/components/pdv/financial/LedgerPeriodBar";
import { ActiveFilterChips } from "@/components/pdv/financial/ActiveFilterChips";
import { PDVTransactionFilters } from "@/components/pdv/financial/PDVTransactionFilters";
import { PDVTransactionDialog } from "@/components/pdv/financial/PDVTransactionDialog";
import { MarkAsPaidDialog } from "@/components/pdv/financial/MarkAsPaidDialog";
import { ReceberTable, type ReceberLinha } from "./ReceberTable";

/**
 * Contas a receber da Força de vendas: a mesma base da tela de lançamentos do financeiro (FinancialLedger com o tipo
 * travado em "a receber": mesmo hook, filtros, resumo e diálogos), trocando só a lista por uma que mostra o pedido
 * de origem e a situação da cobrança no Asaas.
 */
export function ReceberLedger({ title, subtitle }: { title: string; subtitle: string }) {
  const lockedType = "receivable" as const;
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [markAsPaidOpen, setMarkAsPaidOpen] = useState(false);
  const [selected, setSelected] = useState<PDVFinancialTransaction | undefined>();
  const [activeTab, setActiveTab] = useState("open");

  // Igual ao financeiro: completa o horizonte das recorrências ao abrir a tela.
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();
  const jaEstendeu = useRef(false);
  useEffect(() => {
    if (!visibleUserId || jaEstendeu.current) return;
    jaEstendeu.current = true;
    supabase.rpc("pdv_extend_recurring_transactions", { _user_id: visibleUserId }).then(({ data, error }) => {
      if (error) return console.error("[vendas/receber] recorrências", error);
      if (Number(data) > 0) qc.invalidateQueries({ queryKey: ["pdv-financial-transactions"] });
    });
  }, [visibleUserId, qc]);

  const effectiveFilters = useMemo<TransactionFilters>(() => {
    const base = { ...filters, transaction_type: lockedType };
    switch (activeTab) {
      case "open":
        return { ...base, status: ["pending"] };
      case "overdue":
        return { ...base, overdue_only: true };
      case "paid":
        return { ...base, status: ["paid"] };
      default:
        return base;
    }
  }, [filters, activeTab]);

  const { transactions, stats, isLoading, createTransaction, updateTransaction, updateGroup, deleteTransaction, markAsPaid } =
    usePDVFinancialTransactions(effectiveFilters);

  const handleSubmit = async (data: any) => {
    const { __applyToGroup, __groupId, ...limpo } = data;
    if (selected) {
      if (__applyToGroup && __groupId) {
        const { id, ...changes } = limpo;
        await updateGroup({ groupId: __groupId, changes });
      } else {
        await updateTransaction(limpo);
      }
    } else {
      await createTransaction(limpo);
    }
  };

  const handleMarkAsPaidSubmit = async (data: any) => {
    try {
      await markAsPaid(data);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao registrar o recebimento");
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao excluir lançamento");
    }
  };

  const total = useMemo(
    () => (transactions || []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0),
    [transactions],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl md:font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">{subtitle}</p>
        </div>
        <Button onClick={() => { setSelected(undefined); setDialogOpen(true); }} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Nova Conta a Receber
        </Button>
      </div>

      <LedgerPeriodBar filters={filters} onChange={setFilters} />

      <LedgerSummary stats={stats} isLoading={isLoading} periodoLabel={descreverPeriodo(effectiveFilters)} lockedType={lockedType} />

      <ActiveFilterChips filters={filters} onChange={setFilters} lockedType={lockedType} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mais filtros</CardTitle>
          <CardDescription>Cliente, conta contábil, centro de custo e forma de pagamento</CardDescription>
        </CardHeader>
        <CardContent>
          <PDVTransactionFilters filters={filters} onFiltersChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contas a receber</CardTitle>
          <CardDescription>Parcelas de pedidos e demais recebimentos da empresa</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 grid h-auto w-full grid-cols-2 sm:inline-flex sm:h-10 sm:w-auto">
              <TabsTrigger value="open" className="px-2 sm:px-3">Em aberto ({stats.pendingReceivableCount})</TabsTrigger>
              <TabsTrigger value="overdue" className="px-2 sm:px-3">Vencidas ({stats.overdueCount})</TabsTrigger>
              <TabsTrigger value="paid" className="px-2 sm:px-3">Recebidas</TabsTrigger>
              <TabsTrigger value="all" className="px-2 sm:px-3">Todas</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {isLoading ? (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground">Carregando...</p>
                </div>
              ) : (
                <>
                  <ReceberTable
                    transactions={transactions as ReceberLinha[]}
                    onEdit={(t) => { setSelected(t); setDialogOpen(true); }}
                    onDelete={handleDelete}
                    onMarkAsPaid={(t) => { setSelected(t); setMarkAsPaidOpen(true); }}
                  />
                  {transactions.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                      <span className="text-muted-foreground">
                        {transactions.length} {transactions.length === 1 ? "lançamento" : "lançamentos"} nesta lista
                      </span>
                      <span className="font-semibold tabular-nums">Total: {formatBRL(total)}</span>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <PDVTransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={selected}
        onSubmit={handleSubmit}
        lockedType={lockedType}
      />

      <MarkAsPaidDialog
        open={markAsPaidOpen}
        onOpenChange={setMarkAsPaidOpen}
        transaction={selected}
        onSubmit={handleMarkAsPaidSubmit}
      />
    </div>
  );
}
