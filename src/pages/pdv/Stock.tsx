import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Warehouse, AlertTriangle } from "lucide-react";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { usePDVIngredientSuppliers } from "@/hooks/use-pdv-ingredient-suppliers";
import { IngredientCard } from "@/components/pdv/IngredientCard";
import { IngredientDialog } from "@/components/pdv/IngredientDialog";
import { IngredientFilters } from "@/components/pdv/IngredientFilters";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function PDVStock() {
  const {
    ingredients,
    isLoading,
    createIngredient,
    isCreating,
    updateIngredient,
    isUpdating,
    deleteIngredient,
    isDeleting,
    adjustStock,
    isAdjusting,
  } = usePDVIngredients();

  const { createLink, updateLink, deleteLink, ingredientSuppliers: allLinks } = usePDVIngredientSuppliers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<any>(null);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [stockStatus, setStockStatus] = useState("all");

  // Contadores
  const { lowStockCount, criticalStockCount } = useMemo(() => {
    let low = 0;
    let critical = 0;
    ingredients.forEach((ing) => {
      if (ing.current_stock <= ing.min_stock) {
        low++;
        if (ing.current_stock < ing.min_stock * 0.5) {
          critical++;
        }
      }
    });
    return { lowStockCount: low, criticalStockCount: critical };
  }, [ingredients]);

  // Ingredientes filtrados
  const filteredIngredients = useMemo(() => {
    return ingredients.filter((ingredient) => {
      const matchesSearch =
        ingredient.name.toLowerCase().includes(search.toLowerCase()) ||
        ingredient.supplier?.name?.toLowerCase().includes(search.toLowerCase());

      const isLowStock = ingredient.current_stock <= ingredient.min_stock;
      const isCritical = ingredient.current_stock < ingredient.min_stock * 0.5;

      const matchesStatus =
        stockStatus === "all" ||
        (stockStatus === "ok" && !isLowStock) ||
        (stockStatus === "low" && isLowStock && !isCritical) ||
        (stockStatus === "critical" && isCritical);

      return matchesSearch && matchesStatus;
    });
  }, [ingredients, search, stockStatus]);

  // Sincroniza vínculos pdv_ingredient_suppliers
  const syncSupplierLinks = async (
    ingredientId: string,
    newSupplierIds: string[],
    preferredSupplierId: string | null
  ) => {
    const existingLinks = allLinks.filter((l) => l.ingredient_id === ingredientId);
    const existingIds = existingLinks.map((l) => l.supplier_id);

    // Remover vínculos que foram removidos
    const toRemove = existingLinks.filter((l) => !newSupplierIds.includes(l.supplier_id));
    for (const link of toRemove) {
      await deleteLink.mutateAsync(link.id);
    }

    // Adicionar novos vínculos
    const toAdd = newSupplierIds.filter((id) => !existingIds.includes(id));
    for (const supplierId of toAdd) {
      await createLink.mutateAsync({
        ingredient_id: ingredientId,
        supplier_id: supplierId,
        is_preferred: supplierId === preferredSupplierId,
      });
    }

    // Atualizar is_preferred nos vínculos que permaneceram
    const kept = existingLinks.filter((l) => newSupplierIds.includes(l.supplier_id));
    for (const link of kept) {
      const shouldBePreferred = link.supplier_id === preferredSupplierId;
      if (link.is_preferred !== shouldBePreferred) {
        await updateLink.mutateAsync({
          id: link.id,
          is_preferred: shouldBePreferred,
        });
      }
    }
  };

  const handleCreate = () => {
    setSelectedIngredient(null);
    setDialogOpen(true);
  };

  const handleEdit = (ingredient: any) => {
    setSelectedIngredient(ingredient);
    setDialogOpen(true);
  };

  const handleSubmit = (data: any) => {
    const { _supplierIds = [], _preferredSupplierId, ...ingredientData } = data;

    if (selectedIngredient) {
      updateIngredient(
        { id: selectedIngredient.id, updates: ingredientData },
        {
          onSuccess: () => {
            syncSupplierLinks(selectedIngredient.id, _supplierIds, _preferredSupplierId);
            setDialogOpen(false);
          },
        }
      );
    } else {
      createIngredient(ingredientData, {
        onSuccess: (newIngredient: any) => {
          if (newIngredient?.id && _supplierIds.length > 0) {
            syncSupplierLinks(newIngredient.id, _supplierIds, _preferredSupplierId);
          }
          setDialogOpen(false);
        },
      });
    }
  };

  const handleDelete = () => {
    if (deleteDialog) {
      deleteIngredient(deleteDialog, {
        onSuccess: () => setDeleteDialog(null),
      });
    }
  };

  const handleAdjustStock = (id: string, adjustment: number) => {
    adjustStock({ id, adjustment, reason: "Ajuste manual" });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Estoque</h1>
          <p className="text-muted-foreground">
            Controle de insumos e matéria-prima
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Insumo
        </Button>
      </div>

      {criticalStockCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção!</AlertTitle>
          <AlertDescription>
            Você tem {criticalStockCount} insumo{criticalStockCount > 1 ? 's' : ''} com estoque crítico.
            Realize a reposição o quanto antes.
          </AlertDescription>
        </Alert>
      )}

      <IngredientFilters
        search={search}
        onSearchChange={setSearch}
        stockStatus={stockStatus}
        onStockStatusChange={setStockStatus}
        totalIngredients={ingredients.length}
        filteredCount={filteredIngredients.length}
        lowStockCount={lowStockCount}
        criticalStockCount={criticalStockCount}
      />

      {filteredIngredients.length === 0 ? (
        <Card>
          <CardContent className="min-h-[400px] flex items-center justify-center">
            <div className="text-center space-y-4">
              <Warehouse className="h-16 w-16 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-medium">
                  {ingredients.length === 0
                    ? "Nenhum insumo cadastrado"
                    : "Nenhum insumo encontrado"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {ingredients.length === 0
                    ? "Comece cadastrando seus primeiros insumos"
                    : "Tente ajustar os filtros de busca"}
                </p>
              </div>
              {ingredients.length === 0 && (
                <Button onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Cadastrar Insumo
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIngredients.map((ingredient) => (
            <IngredientCard
              key={ingredient.id}
              ingredient={ingredient}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteDialog(id)}
              onAdjustStock={handleAdjustStock}
            />
          ))}
        </div>
      )}

      <IngredientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ingredient={selectedIngredient}
        onSubmit={handleSubmit}
        isSubmitting={isCreating || isUpdating}
      />

      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este insumo? Esta ação não pode
              ser desfeita e pode afetar as fichas técnicas dos produtos.
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
