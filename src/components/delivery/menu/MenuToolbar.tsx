import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, Search } from "lucide-react";

export type QuickFilter = "all" | "available" | "unavailable" | "promo";

interface MenuToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: QuickFilter;
  onFilterChange: (value: QuickFilter) => void;
  onNewCategory: () => void;
  onNewProduct: () => void;
}

export const MenuToolbar = ({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  onNewCategory,
  onNewProduct,
}: MenuToolbarProps) => {
  return (
    <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">Gerenciar Cardápio</h1>
          <p className="text-sm text-muted-foreground">
            Organize categorias, produtos e disponibilidade do delivery
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={onNewCategory} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Categoria
          </Button>
          <Button onClick={onNewProduct} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar categoria ou produto..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && onFilterChange(v as QuickFilter)}
          className="justify-start flex-wrap"
        >
          <ToggleGroupItem value="all" size="sm" className="text-xs">
            Todos
          </ToggleGroupItem>
          <ToggleGroupItem value="available" size="sm" className="text-xs">
            Disponíveis
          </ToggleGroupItem>
          <ToggleGroupItem value="unavailable" size="sm" className="text-xs">
            Indisponíveis
          </ToggleGroupItem>
          <ToggleGroupItem value="promo" size="sm" className="text-xs">
            Com promoção
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
};
