import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { usePDVCashier } from "@/hooks/use-pdv-cashier";
import { usePDVComandas, Comanda, ComandaItem } from "@/hooks/use-pdv-comandas";
import { usePDVTables, PDVTable } from "@/hooks/use-pdv-tables";
import { OpenCashierDialog } from "@/components/pdv/OpenCashierDialog";
import { CloseCashierDialog, printCashierReport } from "@/components/pdv/CloseCashierDialog";
import { CashMovementDialog } from "@/components/pdv/CashMovementDialog";
import { CashMovementsList } from "@/components/pdv/CashMovementsList";
import { Skeleton } from "@/components/ui/skeleton";
import { CashierHeader } from "@/components/pdv/cashier/CashierHeader";
import { CashierActionsSidebar } from "@/components/pdv/cashier/CashierActionsSidebar";
import { CashierSummaryFooter } from "@/components/pdv/cashier/CashierSummaryFooter";
import { KeyboardShortcutsDialog } from "@/components/pdv/cashier/KeyboardShortcutsDialog";
import { ChargeSelectionDialog } from "@/components/pdv/cashier/ChargeSelectionDialog";
import { PaymentDialog } from "@/components/pdv/cashier/PaymentDialog";
import { EmployeeConsumptionDialog } from "@/components/pdv/cashier/EmployeeConsumptionDialog";
import { QuickExpenseDialog } from "@/components/pdv/financial/QuickExpenseDialog";
import { SalonQueuePanel } from "@/components/pdv/cashier/SalonQueuePanel";
import { usePDVComandasRealtime } from "@/hooks/use-pdv-comandas-realtime";
import { usePDVDeliveryQueue } from "@/hooks/use-pdv-delivery-queue";
import { usePDVOrders } from "@/hooks/use-pdv-orders";

export default function PDVCashier() {
  // Realtime: nova comanda do garçom aparece na fila sem reload
  usePDVComandasRealtime();

  const {
    activeSession,
    movements,
    isLoading,
    openCashier,
    isOpeningCashier,
    closeCashier,
    isClosingCashier,
    addMovement,
    isAddingMovement,
    lastClosedSession,
    lastClosedMovements,
    drawerBalance,
    totalReinforcements,
  } = usePDVCashier();

  const { comandas, cancelComanda, getPendingPaymentComandas, getItemsByComanda } = usePDVComandas();
  const { tables } = usePDVTables();
  const { orders, cancelOrder } = usePDVOrders();
  const { all: deliveryOrders } = usePDVDeliveryQueue();
  const inactiveOrderIds = useMemo(
    () => new Set(
      (orders || [])
        .filter((o: any) => ["cancelada", "fechada", "fechado"].includes(o.status))
        .map((o: any) => o.id),
    ),
    [orders],
  );
  const liveTableOrderIds = useMemo(
    () => new Set(
      (tables || [])
        .map((t: any) => t.current_order_id)
        .filter((id: string | null): id is string => !!id),
    ),
    [tables],
  );

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movementDialog, setMovementDialog] = useState(false);
  const [movementType, setMovementType] = useState<"sangria" | "reforco">("reforco");
  const [shortcutsDialog, setShortcutsDialog] = useState(false);
  const [chargeDialog, setChargeDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentSplitByComanda, setPaymentSplitByComanda] = useState(false);
  const [employeeDialog, setEmployeeDialog] = useState(false);
  const [quickExpenseDialog, setQuickExpenseDialog] = useState(false);

  // Payment state
  const [selectedComanda, setSelectedComanda] = useState<Comanda | null>(null);
  const [selectedComandaItems, setSelectedComandaItems] = useState<ComandaItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<PDVTable | null>(null);
  const [selectedTableComandas, setSelectedTableComandas] = useState<Comanda[]>([]);
  const [selectedTableItems, setSelectedTableItems] = useState<ComandaItem[]>([]);
  const paymentOpenTimerRef = useRef<number | null>(null);
  const isOpeningPaymentRef = useRef(false);

  const handleOpenCashier = (openingBalance: number) => {
    openCashier({ openingBalance });
    setOpenDialog(false);
  };

  const handleCloseCashier = (payload: Omit<import("@/hooks/use-pdv-cashier").CloseCashierPayload, "sessionId">) => {
    if (!activeSession) return;
    closeCashier({ sessionId: activeSession.id, ...payload });
    setCloseDialog(false);
  };

  const handleAddMovement = (
    type: "sangria" | "reforco",
    amount: number,
    description?: string
  ) => {
    addMovement({ type, amount, description });
    setMovementDialog(false);
  };

  const handleOpenMovementDialog = (type: "sangria" | "reforco") => {
    setMovementType(type);
    setMovementDialog(true);
  };

  const handleTryCloseCashier = () => {
    const openComandas = comandas.filter(c => c.status === "aberta");
    if (openComandas.length > 0) {
      toast.error(`Existem ${openComandas.length} comanda(s) aberta(s). Feche ou cancele todas antes de encerrar o caixa.`);
      return;
    }
    const pendingDelivery = deliveryOrders.filter(
      (o) => !["completed", "cancelled"].includes(o.status),
    );
    if (pendingDelivery.length > 0) {
      toast.error(
        `Existem ${pendingDelivery.length} pedido(s) de delivery em andamento. Conclua ou cancele todos antes de encerrar o caixa.`,
      );
      return;
    }
    setCloseDialog(true);
  };

  const openPaymentDeferred = () => {
    if (paymentOpenTimerRef.current !== null) {
      window.clearTimeout(paymentOpenTimerRef.current);
    }
    isOpeningPaymentRef.current = true;
    setPaymentDialog(false);
    paymentOpenTimerRef.current = window.setTimeout(() => {
      setPaymentDialog(true);
      isOpeningPaymentRef.current = false;
      paymentOpenTimerRef.current = null;
    }, 0);
  };

  const handlePaymentOpenChange = (open: boolean) => {
    if (!open && paymentOpenTimerRef.current !== null) {
      window.clearTimeout(paymentOpenTimerRef.current);
      paymentOpenTimerRef.current = null;
      isOpeningPaymentRef.current = false;
    }
    setPaymentDialog(open);
  };

  useEffect(() => {
    return () => {
      if (paymentOpenTimerRef.current !== null) {
        window.clearTimeout(paymentOpenTimerRef.current);
      }
    };
  }, []);

  const handleSelectComanda = (comanda: Comanda, items: ComandaItem[]) => {
    setSelectedComanda(comanda);
    setSelectedComandaItems(items);
    setSelectedTable(null);
    setSelectedTableComandas([]);
    setSelectedTableItems([]);
    setPaymentSplitByComanda(false);
    setChargeDialog(false);
    openPaymentDeferred();
  };

  const handleSelectTable = (table: PDVTable, comandas: Comanda[], items: ComandaItem[]) => {
    setSelectedTable(table);
    setSelectedTableComandas(comandas);
    setSelectedTableItems(items);
    setSelectedComanda(null);
    setSelectedComandaItems([]);
    setPaymentSplitByComanda(false);
    setChargeDialog(false);
    openPaymentDeferred();
  };

  const handleSelectTablePending = (table: PDVTable, comandas: Comanda[], items: ComandaItem[]) => {
    setSelectedTable(table);
    setSelectedTableComandas(comandas);
    setSelectedTableItems(items);
    setSelectedComanda(null);
    setSelectedComandaItems([]);
    setPaymentSplitByComanda(comandas.length > 1);
    setChargeDialog(false);
    openPaymentDeferred();
  };

  const handlePaymentSuccess = () => {
    setSelectedComanda(null);
    setSelectedComandaItems([]);
    setSelectedTable(null);
    setSelectedTableComandas([]);
    setSelectedTableItems([]);
  };

  const handleReprintLastCashier = () => {
    if (!lastClosedSession) return;
    printCashierReport({
      session: lastClosedSession,
      movements: lastClosedMovements,
      closingBalance: lastClosedSession.closing_balance || 0,
      notes: lastClosedSession.notes || "",
      riskLevel: (lastClosedSession as any).fraud_risk_level || "ok",
    });
  };

  // Calcular valores
  const openingBalance = activeSession?.opening_balance || 0;
  const totalCash = activeSession?.total_cash || 0;
  const rawTotalCredit = (activeSession as any)?.total_credit || 0;
  const totalDebit = (activeSession as any)?.total_debit || 0;
  // Fallback de exibição: vendas legadas registradas como "cartao" (sem distinção
  // crédito/débito) ainda podem existir em sessões antigas. Quando não houver
  // nenhum valor em crédito nem em débito, usamos o total_card legado como
  // crédito apenas para conferência visual — sem afetar o cálculo da gaveta.
  const legacyCard = (activeSession as any)?.total_card || 0;
  const totalCredit =
    rawTotalCredit === 0 && totalDebit === 0 && legacyCard > 0
      ? legacyCard
      : rawTotalCredit;
  const totalPix = activeSession?.total_pix || 0;
  const totalVoucher = (activeSession as any)?.total_voucher || 0;
  const totalOnlineDelivery = (activeSession as any)?.total_online_delivery || 0;
  const totalWithdrawals = activeSession?.total_withdrawals || 0;
  const totalSales = activeSession?.total_sales || 0;

  // Dinheiro de vendas = valor das vendas pagas em dinheiro (já líquido do troco).
  // total_cash é incrementado pelo valor da venda em buildSessionDeltas.
  const netCash = totalCash;
  // drawerBalance e totalReinforcements vêm do hook (fonte única de verdade).

  // Atalhos de teclado para ações rápidas
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se estiver em input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Ignorar se algum dialog estiver aberto (exceto F12 que pode fechar o shortcuts dialog)
      if (openDialog || closeDialog || movementDialog || chargeDialog || paymentDialog) {
        if (e.key === "F12") {
          e.preventDefault();
          setShortcutsDialog(false);
        }
        return;
      }

      // Ignorar se estiver processando
      const isProcessing = isOpeningCashier || isClosingCashier || isAddingMovement || isOpeningPaymentRef.current;
      if (isProcessing) return;

      switch (e.key) {
        case "F1":
          e.preventDefault();
          if (!activeSession) setOpenDialog(true);
          break;
        case "F2":
          e.preventDefault();
          if (activeSession) handleOpenMovementDialog("reforco");
          break;
        case "F3":
          e.preventDefault();
          if (activeSession) handleOpenMovementDialog("sangria");
          break;
        case "F4":
          e.preventDefault();
          if (activeSession) handleTryCloseCashier();
          break;
        case "F5":
          e.preventDefault();
          if (activeSession) {
            // Atalho rápido: cobra a comanda mais antiga da fila do salão.
            // Se a fila estiver vazia, abre o dialog de cobrança avulsa/mesa direta.
            const pending = getPendingPaymentComandas().filter((c) => {
              // Defesa: ignora comandas órfãs / pedidos finalizados / mesa liberada / sem itens vivos.
              if (c.order_id && inactiveOrderIds.has(c.order_id)) return false;
              if (c.order_id && !liveTableOrderIds.has(c.order_id)) {
                // Pedido órfão: nenhuma mesa aponta mais para ele
                return false;
              }
              return getItemsByComanda(c.id).length > 0;
            });
            if (pending.length > 0) {
              const sorted = [...pending].sort((a, b) => {
                const at = new Date(a.closed_by_waiter_at ?? a.updated_at).getTime();
                const bt = new Date(b.closed_by_waiter_at ?? b.updated_at).getTime();
                return at - bt;
              });
              const first = sorted[0];
              handleSelectComanda(first, getItemsByComanda(first.id));
            } else {
              window.setTimeout(() => setChargeDialog(true), 0);
            }
          }
          break;
        case "F12":
          e.preventDefault();
          setShortcutsDialog(prev => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSession, openDialog, closeDialog, movementDialog, chargeDialog, paymentDialog, shortcutsDialog, isOpeningCashier, isClosingCashier, isAddingMovement, getPendingPaymentComandas, getItemsByComanda, inactiveOrderIds, liveTableOrderIds]);

  if (isLoading) {
    return (
      <div className="w-full px-4 md:px-6 lg:px-8 py-4 h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col gap-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0">
          <Skeleton className="lg:col-span-3" />
          <Skeleton className="" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-4 h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col gap-4">
      {/* Main Content — grid: [header+movimentações] | ações | salão */}
      <div className="grid grid-cols-1 lg:grid-cols-[6fr_5fr_9fr] gap-4 flex-1 min-h-0">
        {/* Coluna esquerda: header + movimentações */}
        <div className="flex flex-col gap-4 min-h-0">
          <CashierHeader
            isOpen={!!activeSession}
            openedAt={activeSession?.opened_at || null}
          />
          <Card className="flex flex-col min-h-0 flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Movimentações</CardTitle>
            <CardDescription>
              {activeSession
                ? "Histórico de entradas e saídas do caixa atual"
                : "Abra o caixa para registrar movimentações"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            {activeSession ? (
              <div className="h-full overflow-auto">
                <CashMovementsList movements={movements} />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-4 text-muted-foreground">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                    <Lock className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="font-medium">Caixa fechado</p>
                    <p className="text-sm">Clique em "Abrir Caixa" para começar</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
          {/* Footer com Resumo (abaixo das movimentações, dentro da coluna esquerda) */}
          <CashierSummaryFooter
            openingBalance={openingBalance}
            netCash={netCash}
            totalReinforcements={totalReinforcements}
            totalWithdrawals={totalWithdrawals}
            drawerBalance={drawerBalance}
            totalCash={totalCash}
            totalCredit={totalCredit}
            totalDebit={totalDebit}
            totalPix={totalPix}
            totalVoucher={totalVoucher}
            totalOnlineDelivery={totalOnlineDelivery}
            totalSales={totalSales}
            isOpen={!!activeSession}
          />
        </div>

        {/* Sidebar de Ações */}
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <CardContent className="p-3 flex-1 min-h-0 overflow-hidden">
            <CashierActionsSidebar
              isOpen={!!activeSession}
              isLoading={isOpeningCashier || isClosingCashier || isAddingMovement}
              onOpenCashier={() => setOpenDialog(true)}
              onCloseCashier={handleTryCloseCashier}
              onAddReinforcement={() => handleOpenMovementDialog("reforco")}
              onAddWithdrawal={() => handleOpenMovementDialog("sangria")}
              onCharge={() => window.setTimeout(() => setChargeDialog(true), 0)}
              onShowHelp={() => setShortcutsDialog(true)}
              onReprintLast={lastClosedSession ? handleReprintLastCashier : undefined}
              onEmployeeConsumption={() => setEmployeeDialog(true)}
              onQuickExpense={() => window.setTimeout(() => setQuickExpenseDialog(true), 0)}
            />
          </CardContent>
        </Card>

        {/* Painel lateral: fila do Salão (sempre visível) */}
        <Card className="flex flex-col min-h-0 overflow-hidden p-0">
          <SalonQueuePanel
            isOpen={!!activeSession}
            onSelectComanda={handleSelectComanda}
            onSelectTablePending={handleSelectTablePending}
              onOpenDirectCharge={() => window.setTimeout(() => setChargeDialog(true), 0)}
          />
        </Card>
      </div>


      {/* Dialogs */}
      <OpenCashierDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        onOpen={handleOpenCashier}
        isOpening={isOpeningCashier}
      />

      <CloseCashierDialog
        open={closeDialog}
        onOpenChange={setCloseDialog}
        onClose={handleCloseCashier}
        isClosing={isClosingCashier}
        session={activeSession}
        movements={movements}
      />

      <CashMovementDialog
        open={movementDialog}
        onOpenChange={setMovementDialog}
        onAddMovement={handleAddMovement}
        isAdding={isAddingMovement}
        defaultType={movementType}
        drawerBalance={drawerBalance}
      />

      <KeyboardShortcutsDialog
        open={shortcutsDialog}
        onOpenChange={setShortcutsDialog}
      />

      <ChargeSelectionDialog
        open={chargeDialog}
        onOpenChange={setChargeDialog}
        onSelectComanda={handleSelectComanda}
        onSelectTable={handleSelectTable}
        onSelectTablePending={handleSelectTablePending}
        onCancelComanda={(comandaId) => {
          cancelComanda(comandaId);
          setChargeDialog(false);
        }}
        onCancelTable={(_tableId, orderId) => {
          // RPC pdv_cancel_order cancela comandas e libera a mesa numa transação
          cancelOrder({ id: orderId, reason: "Cancelado pelo caixa" });
          setChargeDialog(false);
        }}
      />

      <PaymentDialog
        open={paymentDialog}
        onOpenChange={handlePaymentOpenChange}
        comanda={selectedComanda}
        items={selectedComandaItems}
        table={selectedTable}
        tableComandas={selectedTableComandas}
        tableItems={selectedTableItems}
        splitByComanda={paymentSplitByComanda}
        onSuccess={handlePaymentSuccess}
        drawerBalance={drawerBalance}
      />

      <EmployeeConsumptionDialog
        open={employeeDialog}
        onOpenChange={setEmployeeDialog}
      />
    </div>
  );
}
