import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ShoppingCart, Package, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsivePageHeader } from "@/components/ui/responsive-page-header";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { QuotationRequestDialog } from "@/components/pdv/purchases/QuotationRequestDialog";

interface LowStockItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  suggested_quantity: number;
}

export default function ShoppingList() {
  const navigate = useNavigate();
  const { ingredients, isLoading } = usePDVIngredients();
  // Quantos insumos têm régua: separa "está tudo em dia" de "ninguém configurou".
  const ingredientsWithMinimum = useMemo(
    () => ingredients.filter((i) => (i.min_stock || 0) > 0).length,
    [ingredients],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filter ingredients below minimum stock
  const lowStockItems: LowStockItem[] = useMemo(() => {
    return ingredients
      .filter((ing) => {
        const currentStock = ing.current_stock || 0;
        const minStock = ing.min_stock || 0;
        return minStock > 0 && currentStock < minStock;
      })
      .map((ing) => ({
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        current_stock: ing.current_stock || 0,
        min_stock: ing.min_stock || 0,
        suggested_quantity: (ing.min_stock || 0) - (ing.current_stock || 0),
      }))
      .sort((a, b) => {
        // Sort by criticality (percentage of stock remaining)
        const aPercent = a.current_stock / a.min_stock;
        const bPercent = b.current_stock / b.min_stock;
        return aPercent - bPercent;
      });
  }, [ingredients]);

  const filteredItems = lowStockItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)));
    }
  };

  const selectedItemsData = useMemo(() => {
    return lowStockItems.filter((item) => selectedItems.has(item.id));
  }, [lowStockItems, selectedItems]);

  const getStockStatus = (item: LowStockItem) => {
    const percent = (item.current_stock / item.min_stock) * 100;
    if (percent <= 25) return { label: "Crítico", variant: "destructive" as const };
    if (percent <= 50) return { label: "Baixo", variant: "secondary" as const };
    return { label: "Atenção", variant: "outline" as const };
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <ResponsivePageHeader
        title="Lista de Compras"
        subtitle="Itens abaixo do estoque mínimo que precisam ser repostos"
      >
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={selectedItems.size === 0}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          Criar Cotação ({selectedItems.size})
        </Button>
      </ResponsivePageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Itens Abaixo do Mínimo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold">{lowStockItems.length}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Selecionados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{selectedItems.size}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Críticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold text-destructive">
                {lowStockItems.filter((i) => i.current_stock / i.min_stock <= 0.25).length}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Search and Select All */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ingrediente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={handleSelectAll}
          disabled={filteredItems.length === 0}
        >
          {selectedItems.size === filteredItems.length && filteredItems.length > 0
            ? "Desmarcar Todos"
            : "Selecionar Todos"}
        </Button>
      </div>

      {/* Items List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            {/* A lista só consegue sugerir reposição de quem tem mínimo
                definido. Dizer "estoque em dia" quando NENHUM insumo tem
                mínimo é mentira confortável: o gestor acha que está tudo certo
                justamente porque a régua nunca foi criada. */}
            {searchQuery ? (
              <>
                <h3 className="text-lg font-semibold mb-2">Nenhum item encontrado</h3>
                <p className="text-muted-foreground text-center">Tente ajustar a busca</p>
              </>
            ) : ingredientsWithMinimum === 0 ? (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  Nenhum insumo tem estoque mínimo definido
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Esta lista mostra o que caiu abaixo do mínimo · sem essa régua ela não tem
                  como sugerir reposição. Defina o estoque mínimo dos insumos em Estoque, e
                  eles passam a aparecer aqui sozinhos.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => navigate("/pdv/estoque")}>
                  Ir para Estoque
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-2">Estoque em dia!</h3>
                <p className="text-muted-foreground text-center">
                  Todos os {ingredientsWithMinimum} insumo(s) com mínimo definido estão acima
                  dele.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const status = getStockStatus(item);
            const isSelected = selectedItems.has(item.id);

            return (
              <Card
                key={item.id}
                className={`cursor-pointer transition-colors ${
                  isSelected ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => handleToggleItem(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleItem(item.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{item.name}</h4>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>
                          Atual: <strong className="text-foreground">{item.current_stock} {item.unit}</strong>
                        </span>
                        <span>
                          Mínimo: <strong className="text-foreground">{item.min_stock} {item.unit}</strong>
                        </span>
                        <span>
                          Sugerido: <strong className="text-primary">{item.suggested_quantity} {item.unit}</strong>
                        </span>
                      </div>
                    </div>
                    {/* Stock bar */}
                    <div className="hidden sm:block w-24">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            status.variant === "destructive"
                              ? "bg-destructive"
                              : status.variant === "secondary"
                              ? "bg-orange-500"
                              : "bg-yellow-500"
                          }`}
                          style={{
                            width: `${Math.min((item.current_stock / item.min_stock) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        {Math.round((item.current_stock / item.min_stock) * 100)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <QuotationRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        preselectedItems={selectedItemsData.map((item) => ({
          ingredient_id: item.id,
          ingredient_name: item.name,
          quantity_needed: item.suggested_quantity,
          unit: item.unit,
        }))}
      />
    </div>
  );
}
