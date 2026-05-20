import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Truck } from "lucide-react";
import {
  usePDVSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  PDVSupplier,
} from "@/hooks/use-pdv-suppliers";
import { useSupplierPurchaseStats } from "@/hooks/use-supplier-purchase-stats";
import { SupplierCard } from "@/components/pdv/SupplierCard";
import { SupplierDialog } from "@/components/pdv/SupplierDialog";
import { SupplierFilters, SupplierSortBy } from "@/components/pdv/SupplierFilters";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function PDVSuppliers() {
  const { suppliers, isLoading } = usePDVSuppliers();
  const { stats, isLoading: statsLoading } = useSupplierPurchaseStats();
  const { mutate: createSupplier, isPending: isCreating } = useCreateSupplier();
  const { mutate: updateSupplier, isPending: isUpdating } = useUpdateSupplier();
  const { mutate: deleteSupplier, isPending: isDeleting } = useDeleteSupplier();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<PDVSupplier | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SupplierSortBy>("name_asc");

  const extraCategories = useMemo(
    () => Array.from(new Set(suppliers.map((s) => s.category).filter(Boolean) as string[])),
    [suppliers]
  );

  const filteredSuppliers = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = suppliers.filter((supplier) => {
      const matchesSearch =
        !q ||
        supplier.name.toLowerCase().includes(q) ||
        supplier.cnpj?.toLowerCase().includes(q) ||
        supplier.contact_name?.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && supplier.is_active) ||
        (statusFilter === "inactive" && !supplier.is_active);

      const matchesCategory =
        categoryFilter === "all" || supplier.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "name_desc":
          return b.name.localeCompare(a.name, "pt-BR");
        case "recent":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "volume":
          return (stats.get(b.id)?.monthTotal || 0) - (stats.get(a.id)?.monthTotal || 0);
        case "name_asc":
        default:
          return a.name.localeCompare(b.name, "pt-BR");
      }
    });
    return sorted;
  }, [suppliers, search, statusFilter, categoryFilter, sortBy, stats]);

  const handleCreate = () => {
    setSelectedSupplier(null);
    setDialogOpen(true);
  };

  const handleEdit = (supplier: PDVSupplier) => {
    setSelectedSupplier(supplier);
    setDialogOpen(true);
  };

  const handleSubmit = (data: any) => {
    if (selectedSupplier) {
      updateSupplier(
        { id: selectedSupplier.id, updates: data },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createSupplier(data, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleToggleActive = (supplier: PDVSupplier) => {
    updateSupplier({
      id: supplier.id,
      updates: { is_active: !supplier.is_active },
    });
  };

  const handleDelete = () => {
    if (deleteDialog) {
      deleteSupplier(deleteDialog, { onSuccess: () => setDeleteDialog(null) });
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  const hasNoSuppliers = suppliers.length === 0;

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fornecedores</h1>
          <p className="text-muted-foreground">
            Gerencie seus fornecedores de insumos
          </p>
        </div>
        {!hasNoSuppliers && (
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Fornecedor
          </Button>
        )}
      </div>

      {!hasNoSuppliers && (
        <SupplierFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          extraCategories={extraCategories}
          totalSuppliers={suppliers.length}
          filteredCount={filteredSuppliers.length}
        />
      )}

      {hasNoSuppliers ? (
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4 max-w-sm">
            <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center">
              <Truck className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Nenhum fornecedor cadastrado</h3>
              <p className="text-sm text-muted-foreground">
                Cadastre seus parceiros para vincular insumos, compras e cotações.
              </p>
            </div>
            <Button onClick={handleCreate} size="lg">
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar primeiro fornecedor
            </Button>
          </div>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="min-h-[200px] flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhum fornecedor encontrado com os filtros atuais.
            </p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              stat={stats.get(supplier.id)}
              statsLoading={statsLoading}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteDialog(id)}
              onToggleActive={handleToggleActive}
              isToggling={isUpdating}
            />
          ))}
        </div>
      )}

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplier={selectedSupplier}
        onSubmit={handleSubmit}
        isSubmitting={isCreating || isUpdating}
      />

      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este fornecedor? Os insumos vinculados a ele
              permanecerão cadastrados, mas sem fornecedor associado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
