import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsivePageHeader } from "@/components/ui/responsive-page-header";
import { Plus, Search, ClipboardList } from "lucide-react";
import { usePDVComandas, Comanda } from "@/hooks/use-pdv-comandas";
import { usePDVCashier } from "@/hooks/use-pdv-cashier";
import { ComandaCard } from "@/components/pdv/ComandaCard";
import { ComandaDialog } from "@/components/pdv/ComandaDialog";
import { ComandaDetailsDialog } from "@/components/pdv/ComandaDetailsDialog";
import { ComandaAddItemDialog } from "@/components/pdv/ComandaAddItemDialog";
import { TransferItemsDialog } from "@/components/pdv/transfer/TransferItemsDialog";
import { toast } from "sonner";

export default function ComandasPage() {
  const {
    comandas,
    comandaItems,
    isLoading,
    createComanda,
    closeComanda,
    cancelComanda,
    addItem,
    updateItem,
    removeItem,
    sendToKitchen,
    getItemsByComanda,
    getStandaloneComandas,
    isCreating,
    isAddingItem,
  } = usePDVComandas();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("abertas");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedComanda, setSelectedComanda] = useState<Comanda | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [addItemComanda, setAddItemComanda] = useState<Comanda | null>(null);
  const [transferState, setTransferState] = useState<{
    sourceComandaId: string;
    itemIds: string[];
  } | null>(null);

  const { activeSession } = usePDVCashier();

  const handleTryOpenCreateDialog = () => {
    if (!activeSession) {
      toast.error("Abra o caixa antes de criar uma comanda.");
      return;
    }
    setCreateDialogOpen(true);
  };

  // Filter comandas based on tab and search
  const standaloneComandas = getStandaloneComandas();
  const closedComandas = comandas.filter((c) => c.status === "fechada" && !c.order_id);
  const cancelledComandas = comandas.filter((c) => c.status === "cancelada" && !c.order_id);

  const getFilteredComandas = () => {
    let list: Comanda[] = [];
    switch (tab) {
      case "abertas":
        list = standaloneComandas;
        break;
      case "fechadas":
        list = closedComandas;
        break;
      case "canceladas":
        list = cancelledComandas;
        break;
    }

    if (search) {
      const searchLower = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.comanda_number.toLowerCase().includes(searchLower) ||
          c.customer_name?.toLowerCase().includes(searchLower)
      );
    }

    return list;
  };

  const filteredComandas = getFilteredComandas();

  const handleCreateComanda = async (data: {
    customerName?: string;
    personNumber?: number;
    notes?: string;
  }) => {
    await createComanda({
      customerName: data.customerName,
      notes: data.notes,
    });
  };

  const handleViewComanda = (comanda: Comanda) => {
    setSelectedComanda(comanda);
    setDetailsDialogOpen(true);
  };

  const handleAddItemClick = (comanda: Comanda) => {
    setAddItemComanda(comanda);
    setAddItemDialogOpen(true);
  };

  const handleAddItem = async (data: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
    selectedOptions?: import("@/components/pdv/ProductOptionSelector").SelectedOption[];
  }) => {
    if (!addItemComanda) return;
    await addItem({
      comandaId: addItemComanda.id,
      ...data,
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <ResponsivePageHeader
        title="Comandas Avulsas"
        description="Gerencie comandas sem mesa associada"
        action={
          <Button onClick={handleTryOpenCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Comanda
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar comanda..."
            className="pl-9"
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="abertas">
              Abertas ({standaloneComandas.length})
            </TabsTrigger>
            <TabsTrigger value="fechadas">
              Fechadas ({closedComandas.length})
            </TabsTrigger>
            <TabsTrigger value="canceladas">
              Canceladas ({cancelledComandas.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Comandas grid */}
      {filteredComandas.length === 0 ? (
        <div className="py-16 text-center">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nenhuma comanda encontrada</h3>
          <p className="text-muted-foreground mt-1">
            {tab === "abertas"
              ? "Crie uma nova comanda para começar"
              : "Nenhuma comanda nesta categoria"}
          </p>
          {tab === "abertas" && (
            <Button
              className="mt-4"
              onClick={handleTryOpenCreateDialog}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Comanda
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredComandas.map((comanda) => (
            <ComandaCard
              key={comanda.id}
              comanda={comanda}
              items={getItemsByComanda(comanda.id)}
              onView={handleViewComanda}
              onAddItem={handleAddItemClick}
              onClose={(c) => closeComanda(c.id)}
              onCancel={(c) => cancelComanda(c.id)}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <ComandaDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateComanda}
        isLoading={isCreating}
      />

      {/* Details Dialog */}
      <ComandaDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        comanda={selectedComanda}
        items={selectedComanda ? getItemsByComanda(selectedComanda.id) : []}
        onAddItem={() => {
          if (selectedComanda) {
            setAddItemComanda(selectedComanda);
            setAddItemDialogOpen(true);
          }
        }}
        onUpdateItem={(id, updates) => updateItem({ id, ...updates })}
        onRemoveItem={removeItem}
        onSendToKitchen={sendToKitchen}
        onTransferItem={(itemId) =>
          selectedComanda &&
          setTransferState({ sourceComandaId: selectedComanda.id, itemIds: [itemId] })
        }
        onTransferMultiple={(itemIds) =>
          selectedComanda &&
          setTransferState({ sourceComandaId: selectedComanda.id, itemIds })
        }
        onClose={() => selectedComanda && closeComanda(selectedComanda.id)}
        onCancel={() => selectedComanda && cancelComanda(selectedComanda.id)}
      />

      {/* Add Item Dialog */}
      <ComandaAddItemDialog
        open={addItemDialogOpen}
        onOpenChange={setAddItemDialogOpen}
        onAddItem={handleAddItem}
        isLoading={isAddingItem}
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
    </div>
  );
}
