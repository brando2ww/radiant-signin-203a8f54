import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Grid3x3, Map, Trash2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { usePDVTables, PDVTable } from "@/hooks/use-pdv-tables";
import { usePDVOrders } from "@/hooks/use-pdv-orders";
import { usePDVSectors, PDVSector } from "@/hooks/use-pdv-sectors";
import { usePDVComandas, Comanda } from "@/hooks/use-pdv-comandas";
import { TableCard, SortableTableCard } from "@/components/pdv/TableCard";
import { TableDialog } from "@/components/pdv/TableDialog";
import { TableDetailsDialog } from "@/components/pdv/TableDetailsDialog";
import { OrderDetailsDialog } from "@/components/pdv/OrderDetailsDialog";
import { SalonFilters } from "@/components/pdv/SalonFilters";
import { SalonMapView } from "@/components/pdv/salon/SalonMapView";
import { SectorDialog } from "@/components/pdv/SectorDialog";
import { TrashDialog } from "@/components/pdv/TrashDialog";
import { StandaloneComandasBar } from "@/components/pdv/StandaloneComandasBar";
import { ComandaDialog } from "@/components/pdv/ComandaDialog";
import { ComandaDetailsDialog } from "@/components/pdv/ComandaDetailsDialog";
import { ComandaAddItemDialog } from "@/components/pdv/ComandaAddItemDialog";
import { PaymentDialog } from "@/components/pdv/cashier/PaymentDialog";
import { TransferItemsDialog } from "@/components/pdv/transfer/TransferItemsDialog";
import { usePDVCashier } from "@/hooks/use-pdv-cashier";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

export default function PDVSalon() {
  const {
    tables,
    isLoading: isLoadingTables,
    deletedTables,
    createTable,
    isCreating,
    updateTable,
    isUpdating,
    deleteTable,
    isDeleting,
    restoreTable,
    isRestoring: isRestoringTable,
    permanentDeleteTable,
    isPermanentDeleting: isPermanentDeletingTable,
    mergeTables,
    isMerging,
    unmergeTables,
    isUnmerging,
  } = usePDVTables();

  const { activeSession } = usePDVCashier();

  const {
    orders,
    orderItems,
    isLoading: isLoadingOrders,
    createOrder,
    updateItem,
    removeItem,
    addItem,
    closeOrder,
    cancelOrder,
  } = usePDVOrders();

  const {
    sectors,
    isLoading: isLoadingSectors,
    deletedSectors,
    createSector,
    isCreating: isCreatingSector,
    updateSector,
    isUpdating: isUpdatingSector,
    deleteSector,
    isDeleting: isDeletingSector,
    restoreSector,
    isRestoring: isRestoringSector,
    permanentDeleteSector,
    isPermanentDeleting: isPermanentDeletingSector,
  } = usePDVSectors();

  // Comandas hook
  const {
    comandas,
    comandaItems,
    isLoading: isLoadingComandas,
    getStandaloneComandas,
    getItemsByComanda,
    getComandasByOrder,
    createComanda,
    isCreating: isCreatingComanda,
    updateComanda,
    closeComanda,
    cancelComanda,
    addItem: addComandaItem,
    isAddingItem: isAddingComandaItem,
    updateItem: updateComandaItem,
    removeItem: removeComandaItem,
    sendToKitchen,
  } = usePDVComandas();

  const [tableDialog, setTableDialog] = useState(false);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [tableDetailsOpen, setTableDetailsOpen] = useState(false);
  const [selectedTableForDetails, setSelectedTableForDetails] = useState<any>(null);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [orderedTables, setOrderedTables] = useState<PDVTable[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  
  // Sector dialog state
  const [sectorDialogOpen, setSectorDialogOpen] = useState(false);
  const [selectedSectorForEdit, setSelectedSectorForEdit] = useState<PDVSector | null>(null);
  const [sectorToDelete, setSectorToDelete] = useState<string | null>(null);
  
  // Trash dialog state
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const trashCount = deletedTables.length + deletedSectors.length;

  // Comanda dialog states
  const [comandaDialogOpen, setComandaDialogOpen] = useState(false);
  const [comandaDetailsOpen, setComandaDetailsOpen] = useState(false);
  const [selectedComanda, setSelectedComanda] = useState<Comanda | null>(null);
  const [comandaAddItemOpen, setComandaAddItemOpen] = useState(false);
  const [comandaForTable, setComandaForTable] = useState<{ orderId: string; tableNumber: number } | null>(null);

  // Capacity warning states
  const [capacityWarningOpen, setCapacityWarningOpen] = useState(false);
  const [pendingComandaData, setPendingComandaData] = useState<{ customerName?: string; personNumber?: number; notes?: string; orderId?: string | null } | null>(null);
  const [capacityWarningMessage, setCapacityWarningMessage] = useState("");

  // Payment dialog states
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentComanda, setPaymentComanda] = useState<Comanda | null>(null);
  const [paymentTable, setPaymentTable] = useState<any>(null);
  const [paymentTableComandas, setPaymentTableComandas] = useState<Comanda[]>([]);
  const [paymentTableItems, setPaymentTableItems] = useState<any[]>([]);

  // Transfer items state
  const [transferState, setTransferState] = useState<{
    sourceComandaId: string;
    itemIds: string[];
  } | null>(null);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filtrar pedidos do salão
  const salonOrders = useMemo(() => {
    return orders.filter((o) => o.source === "salao");
  }, [orders]);

  // Contadores
  const { occupiedCount, availableCount } = useMemo(() => {
    const occupied = tables.filter((t) => t.status !== "livre").length;
    const available = tables.filter((t) => t.status === "livre").length;
    return { occupiedCount: occupied, availableCount: available };
  }, [tables]);

  // Mesas filtradas
  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const matchesStatus = statusFilter === "all" || table.status === statusFilter;
      const matchesSector = 
        sectorFilter === "all" || 
        (sectorFilter === "none" ? !table.sector_id : table.sector_id === sectorFilter);
      return matchesStatus && matchesSector;
    });
  }, [tables, statusFilter, sectorFilter]);

  // Sync ordered tables with filtered tables
  useEffect(() => {
    setOrderedTables(filteredTables);
  }, [filteredTables]);

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = orderedTables.findIndex((t) => t.id === active.id);
      const newIndex = orderedTables.findIndex((t) => t.id === over.id);

      const newOrder = arrayMove(orderedTables, oldIndex, newIndex);
      setOrderedTables(newOrder);

      // Persist positions to database
      newOrder.forEach((table, index) => {
        if (table.position_x !== index) {
          updateTable({
            id: table.id,
            updates: { position_x: index },
          });
        }
      });
    }
  };

  const getTableOrder = (tableId: string) => {
    return salonOrders.find(
      (o) => o.table_id === tableId && o.status === "aberta"
    );
  };

  const getOrderItems = (orderId: string) => {
    return orderItems.filter(
      (item) => item.order_id === orderId && !(item as any).is_composite_child,
    );
  };

  const handleCreateTable = () => {
    setSelectedTable(null);
    setTableDialog(true);
  };

  const handleEditTable = (table: any) => {
    setSelectedTable(table);
    setTableDialog(true);
  };

  const handleSubmitTable = (data: any) => {
    if (selectedTable) {
      updateTable(
        { id: selectedTable.id, updates: data },
        {
          onSuccess: () => setTableDialog(false),
        }
      );
    } else {
      createTable(data, {
        onSuccess: () => setTableDialog(false),
      });
    }
  };

  const handleTableClick = (table: PDVTable) => {
    setSelectedTableForDetails(table);
    setTableDetailsOpen(true);
  };

  const handleMapPositionChange = (id: string, x: number, y: number) => {
    // Detectar automaticamente se a mesa está dentro de algum setor
    const TABLE_SIZE = 80;
    const tableCenter = { x: x + TABLE_SIZE / 2, y: y + TABLE_SIZE / 2 };
    
    const containingSector = sectors.find(sector => {
      return (
        tableCenter.x >= sector.position_x &&
        tableCenter.x <= sector.position_x + sector.width &&
        tableCenter.y >= sector.position_y &&
        tableCenter.y <= sector.position_y + sector.height
      );
    });
    
    updateTable({ 
      id, 
      updates: { 
        position_x: x, 
        position_y: y,
        sector_id: containingSector?.id || null
      } 
    });
  };

  const handleMergeTables = (tableId1: string, tableId2: string) => {
    const table1 = tables.find(t => t.id === tableId1);
    const table2 = tables.find(t => t.id === tableId2);

    if (!table1 || !table2) return;

    if (table1.shape !== "square" || table2.shape !== "square") {
      toast.error("Apenas mesas quadradas podem ser unidas");
      return;
    }

    if (table1.merged_with || table2.merged_with) {
      toast.error("Uma das mesas já está unida a outra");
      return;
    }

    mergeTables({ tableId1, tableId2 });
  };

  const handleUnmergeTables = (tableId: string) => {
    unmergeTables(tableId);
  };

  const handleCreateOrder = (tableId: string) => {
    if (!activeSession) {
      toast.error("Abra o caixa antes de iniciar um atendimento");
      return;
    }
    createOrder(
      { source: "salao", table_id: tableId },
      {
        onSuccess: (order) => {
          updateTable({ id: tableId, updates: { status: "ocupada", current_order_id: order.id } });
        },
      }
    );
  };

  const handleViewOrder = (orderId: string) => {
    const order = salonOrders.find((o) => o.id === orderId);
    if (order) {
      setSelectedOrder(order);
      setOrderDetailsOpen(true);
    }
  };

  const handleCloseTable = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table?.current_order_id) return;
    
    const tableComandas = getComandasByOrder(table.current_order_id);
    const allItems = tableComandas.flatMap((c) => getItemsByComanda(c.id));
    
    setPaymentTable(table);
    setPaymentTableComandas(tableComandas);
    setPaymentTableItems(allItems);
    setPaymentComanda(null);
    setPaymentDialogOpen(true);
  };

  const handleUpdateItem = (id: string, updates: Partial<any>) => {
    updateItem({ id, updates });
  };

  const handleCloseOrder = (id: string) => {
    const order = salonOrders.find((o) => o.id === id);
    if (order?.table_id) {
      closeOrder(id, {
        onSuccess: () => {
          updateTable({
            id: order.table_id!,
            updates: { status: "livre", current_order_id: null },
          });
          setOrderDetailsOpen(false);
        },
      });
    }
  };

  const handleCancelOrder = (id: string, reason: string) => {
    cancelOrder(
      { id, reason },
      {
        onSuccess: () => {
          // RPC pdv_cancel_order já libera a mesa e cancela comandas filhas
          setOrderDetailsOpen(false);
        },
      }
    );
  };

  // Sector handlers
  const handleOpenSectorDialog = () => {
    setSelectedSectorForEdit(null);
    setSectorDialogOpen(true);
  };

  const handleEditSector = (sector: PDVSector) => {
    setSelectedSectorForEdit(sector);
    setSectorDialogOpen(true);
  };

  const handleSubmitSector = async (data: { name: string; color: string }) => {
    if (selectedSectorForEdit) {
      await updateSector({ 
        id: selectedSectorForEdit.id, 
        updates: { name: data.name, color: data.color } 
      });
      toast.success("Setor atualizado com sucesso");
    } else {
      await createSector(data);
    }
  };

  const handleSectorDrag = (id: string, x: number, y: number) => {
    updateSector({ id, updates: { position_x: x, position_y: y } });
  };

  const handleSectorResize = (id: string, width: number, height: number) => {
    updateSector({ id, updates: { width, height } });
  };

  const handleDeleteSector = (id: string) => {
    setSectorToDelete(id);
  };

  const confirmDeleteSector = () => {
    if (sectorToDelete) {
      deleteSector(sectorToDelete);
      setSectorToDelete(null);
    }
  };

  // Comanda handlers
  const handleOpenStandaloneComandaDialog = () => {
    setComandaForTable(null);
    setComandaDialogOpen(true);
  };

  const handleOpenTableComandaDialog = (orderId: string, tableNumber: number) => {
    setComandaForTable({ orderId, tableNumber });
    setComandaDialogOpen(true);
  };

  const handleComandaClick = (comanda: Comanda) => {
    setSelectedComanda(comanda);
    setComandaDetailsOpen(true);
  };

  const handleCreateComanda = async (data: { customerName?: string; personNumber?: number; notes?: string; orderId?: string | null; tableNumber?: number }) => {
    if (!activeSession) {
      toast.error("Abra o caixa antes de iniciar um atendimento");
      return;
    }

    // Capacity validation for table comandas
    if (data.orderId && comandaForTable) {
      const table = tables.find(t => t.current_order_id === data.orderId);
      if (table) {
        const tableComandas = getComandasByOrder(data.orderId);
        const existingPersons = tableComandas.reduce((sum, c) => sum + (c.person_number || 1), 0);
        const newPersons = data.personNumber || 1;
        if (existingPersons + newPersons > table.capacity) {
          setCapacityWarningMessage(
            `A mesa tem capacidade para ${table.capacity} pessoas e já possui ${existingPersons} alocadas. Adicionando ${newPersons} pessoa(s) o total será ${existingPersons + newPersons}. Deseja continuar mesmo assim?`
          );
          setPendingComandaData(data);
          // Close ComandaDialog FIRST to avoid stacked overlays
          setComandaDialogOpen(false);
          // Open AlertDialog after a tick so Radix cleans up the previous overlay
          setTimeout(() => setCapacityWarningOpen(true), 150);
          return;
        }
      }
    }

    await executeCreateComanda(data);
  };

  const executeCreateComanda = async (data: { customerName?: string; personNumber?: number; notes?: string; orderId?: string | null }) => {
    await createComanda({
      customerName: data.customerName,
      personNumber: data.personNumber,
      notes: data.notes,
      orderId: data.orderId,
    });
    setComandaDialogOpen(false);
    setComandaForTable(null);
  };

  const handleConfirmCapacityOverride = async () => {
    if (pendingComandaData) {
      await executeCreateComanda(pendingComandaData);
    }
    setCapacityWarningOpen(false);
    setPendingComandaData(null);
    setComandaForTable(null);
  };

  const handleAddComandaItem = async (data: { productId: string; productName: string; quantity: number; unitPrice: number; notes?: string }) => {
    if (!selectedComanda) return;
    await addComandaItem({
      comandaId: selectedComanda.id,
      productId: data.productId,
      productName: data.productName,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      notes: data.notes,
    });
    setComandaAddItemOpen(false);
  };

  const getTableComandas = (orderId: string | null | undefined) => {
    if (!orderId) return [];
    return getComandasByOrder(orderId);
  };

  // Get comanda count for a table
  const getTableComandaCount = (tableId: string) => {
    const order = getTableOrder(tableId);
    if (!order) return 0;
    return getComandasByOrder(order.id).length;
  };

  if (isLoadingTables || isLoadingOrders || isLoadingSectors || isLoadingComandas) {
    return (
      <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      {/* Main content */}
      <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Salão</h1>
            <p className="text-muted-foreground">
              Gerencie suas mesas e atendimentos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup 
              type="single" 
              value={viewMode} 
              onValueChange={(value) => value && setViewMode(value as "grid" | "map")}
            >
              <ToggleGroupItem value="grid" aria-label="Visualização em grid">
                <Grid3x3 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="map" aria-label="Visualização em mapa">
                <Map className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTrashDialogOpen(true)}
              className="relative"
              title="Lixeira"
            >
              <Trash2 className="h-4 w-4" />
              {trashCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
                >
                  {trashCount}
                </Badge>
              )}
            </Button>
            
            <Button onClick={handleCreateTable}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Mesa
            </Button>
          </div>
        </div>

        <SalonFilters
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          totalTables={tables.length}
          filteredCount={filteredTables.length}
          occupiedCount={occupiedCount}
          availableCount={availableCount}
          sectors={sectors}
          sectorFilter={sectorFilter}
          onSectorFilterChange={setSectorFilter}
        />

        {filteredTables.length === 0 ? (
          <Card>
            <CardContent className="min-h-[400px] flex items-center justify-center">
              <div className="text-center space-y-4">
                <Grid3x3 className="h-16 w-16 mx-auto text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-medium">
                    {tables.length === 0
                      ? "Nenhuma mesa cadastrada"
                      : "Nenhuma mesa encontrada"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tables.length === 0
                      ? "Comece adicionando suas primeiras mesas"
                      : "Ajuste os filtros para ver outras mesas"}
                  </p>
                </div>
                {tables.length === 0 && (
                  <Button onClick={handleCreateTable}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Mesa
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : viewMode === "map" ? (
          <SalonMapView
            tables={orderedTables}
            orders={salonOrders}
            sectors={sectors}
            onTableClick={handleTableClick}
            onPositionChange={handleMapPositionChange}
            onMergeTables={handleMergeTables}
            onSectorDrag={handleSectorDrag}
            onSectorResize={handleSectorResize}
            onSectorEdit={handleEditSector}
            onSectorDelete={handleDeleteSector}
            onCreateSector={handleOpenSectorDialog}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedTables.map((t) => t.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-6">
                {orderedTables.map((table) => {
                  const order = getTableOrder(table.id);
                  const sector = sectors.find(s => s.id === table.sector_id);
                  const comandaCount = getTableComandaCount(table.id);
                  return (
                    <SortableTableCard
                      key={table.id}
                      table={table}
                      orderTotal={order ? getTableComandas(order.id).reduce((sum, c) => sum + c.subtotal, 0) || order.total : undefined}
                      orderTime={
                        order
                          ? format(parseISO(order.opened_at), "HH:mm", { locale: ptBR })
                          : undefined
                      }
                      onClick={handleTableClick}
                      sectorColor={sector?.color}
                      sectorName={sector?.name}
                      comandaCount={comandaCount}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Standalone comandas bar - fixed at bottom */}
      <StandaloneComandasBar
        comandas={getStandaloneComandas()}
        onComandaClick={handleComandaClick}
        onCreateComanda={handleOpenStandaloneComandaDialog}
      />

      {/* Table Dialog */}
      <TableDialog
        open={tableDialog}
        onOpenChange={setTableDialog}
        table={selectedTable}
        onSubmit={handleSubmitTable}
        isSubmitting={isCreating || isUpdating}
        sectors={sectors}
        onCreateSector={createSector}
        isCreatingSector={isCreatingSector}
      />

      {/* Table Details Dialog with Comandas */}
      <TableDetailsDialog
        open={tableDetailsOpen}
        onOpenChange={setTableDetailsOpen}
        table={selectedTableForDetails}
        orderTotal={
          selectedTableForDetails?.current_order_id
            ? getTableComandas(selectedTableForDetails.current_order_id).reduce((sum, c) => sum + c.subtotal, 0)
            : undefined
        }
        orderTime={
          selectedTableForDetails
            ? getTableOrder(selectedTableForDetails.id)
              ? format(
                  parseISO(
                    getTableOrder(selectedTableForDetails.id)!.opened_at
                  ),
                  "HH:mm",
                  { locale: ptBR }
                )
              : undefined
            : undefined
        }
        onCreateOrder={handleCreateOrder}
        onViewOrder={handleViewOrder}
        onCloseTable={handleCloseTable}
        onEditTable={handleEditTable}
        onDeleteTable={deleteTable}
        onUnmergeTables={handleUnmergeTables}
        tableComandas={selectedTableForDetails ? getTableComandas(selectedTableForDetails.current_order_id) : []}
        onCreateComanda={
          selectedTableForDetails?.current_order_id
            ? () => handleOpenTableComandaDialog(
                selectedTableForDetails.current_order_id!,
                selectedTableForDetails.table_number
              )
            : undefined
        }
        onViewComanda={handleComandaClick}
        isCreatingComanda={isCreatingComanda}
      />

      {/* Order Details Dialog */}
      <OrderDetailsDialog
        open={orderDetailsOpen}
        onOpenChange={setOrderDetailsOpen}
        order={selectedOrder}
        items={selectedOrder ? getOrderItems(selectedOrder.id) : []}
        onUpdateItem={handleUpdateItem}
        onRemoveItem={removeItem}
        onAddItem={addItem}
        onClose={handleCloseOrder}
        onCancel={handleCancelOrder}
      />

      {/* Sector Dialog */}
      <SectorDialog
        open={sectorDialogOpen}
        onOpenChange={setSectorDialogOpen}
        onSubmit={handleSubmitSector}
        isSubmitting={isCreatingSector || isUpdatingSector}
        sector={selectedSectorForEdit}
      />

      {/* Delete Sector Confirmation */}
      <AlertDialog open={!!sectorToDelete} onOpenChange={() => setSectorToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover setor para a lixeira</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este setor? As mesas associadas não serão excluídas, apenas desvinculadas.
              O setor será movido para a lixeira e poderá ser restaurado posteriormente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSector}>
              Mover para Lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trash Dialog */}
      <TrashDialog
        open={trashDialogOpen}
        onOpenChange={setTrashDialogOpen}
        deletedTables={deletedTables}
        deletedSectors={deletedSectors}
        onRestoreTable={restoreTable}
        onPermanentDeleteTable={permanentDeleteTable}
        onRestoreSector={restoreSector}
        onPermanentDeleteSector={permanentDeleteSector}
        isRestoring={isRestoringTable || isRestoringSector}
        isDeleting={isPermanentDeletingTable || isPermanentDeletingSector}
      />

      {/* Comanda Dialog - for creating new comandas */}
      <ComandaDialog
        open={comandaDialogOpen}
        onOpenChange={setComandaDialogOpen}
        onSubmit={handleCreateComanda}
        orderId={comandaForTable?.orderId || null}
        isLoading={isCreatingComanda}
        tableNumber={comandaForTable?.tableNumber}
      />

      {/* Comanda Details Dialog */}
      <ComandaDetailsDialog
        open={comandaDetailsOpen}
        onOpenChange={setComandaDetailsOpen}
        comanda={selectedComanda}
        items={selectedComanda ? getItemsByComanda(selectedComanda.id) : []}
        onAddItem={() => setComandaAddItemOpen(true)}
        onUpdateItem={(id, updates) => updateComandaItem({ id, ...updates })}
        onRemoveItem={(id) => removeComandaItem(id)}
        onSendToKitchen={(itemIds) => sendToKitchen(itemIds)}
        onTransferItem={(itemId) =>
          selectedComanda &&
          setTransferState({ sourceComandaId: selectedComanda.id, itemIds: [itemId] })
        }
        onTransferMultiple={(itemIds) =>
          selectedComanda &&
          setTransferState({ sourceComandaId: selectedComanda.id, itemIds })
        }
        onClose={() => {
          if (selectedComanda) {
            const items = getItemsByComanda(selectedComanda.id);
            setPaymentComanda(selectedComanda);
            setPaymentTable(null);
            setPaymentTableComandas([]);
            setPaymentTableItems([]);
            setPaymentDialogOpen(true);
            setComandaDetailsOpen(false);
          }
        }}
        onCancel={() => selectedComanda && cancelComanda(selectedComanda.id)}
      />

      {/* Add Item to Comanda Dialog */}
      <ComandaAddItemDialog
        open={comandaAddItemOpen}
        onOpenChange={setComandaAddItemOpen}
        onAddItem={handleAddComandaItem}
        isLoading={isAddingComandaItem}
      />

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        comanda={paymentComanda}
        items={paymentComanda ? getItemsByComanda(paymentComanda.id) : []}
        table={paymentTable}
        tableComandas={paymentTableComandas}
        tableItems={paymentTableItems}
        onSuccess={() => {
          // Close comanda or table after payment
          if (paymentComanda && !paymentTable) {
            closeComanda(paymentComanda.id);
          }
          if (paymentTable) {
            if (paymentTable.current_order_id) {
              closeOrder(paymentTable.current_order_id, {
                onSuccess: () => {
                  updateTable({
                    id: paymentTable.id,
                    updates: { status: "livre", current_order_id: null },
                  });
                },
              });
            }
          }
          setPaymentDialogOpen(false);
          setPaymentComanda(null);
          setPaymentTable(null);
          setPaymentTableComandas([]);
          setPaymentTableItems([]);
        }}
      />

      {/* Transfer Items Dialog */}
      <TransferItemsDialog
        open={!!transferState}
        onOpenChange={(o) => !o && setTransferState(null)}
        sourceComanda={
          transferState ? comandas.find((c) => c.id === transferState.sourceComandaId) || null : null
        }
        items={
          transferState
            ? comandaItems.filter((it) => transferState.itemIds.includes(it.id))
            : []
        }
        onTransferred={() => setTransferState(null)}
      />

      {/* Capacity Warning Dialog - never stacked with ComandaDialog */}
      <AlertDialog open={capacityWarningOpen} onOpenChange={(open) => {
        if (!open) {
          setCapacityWarningOpen(false);
          setPendingComandaData(null);
          setComandaForTable(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Capacidade da mesa excedida</AlertDialogTitle>
            <AlertDialogDescription>
              {capacityWarningMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setCapacityWarningOpen(false);
              setPendingComandaData(null);
              setComandaForTable(null);
            }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCapacityOverride}>
              Continuar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
