import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface IngredientFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  stockStatus: string;
  onStockStatusChange: (value: string) => void;
  totalIngredients: number;
  filteredCount: number;
  lowStockCount: number;
  criticalStockCount: number;
  categories?: string[];
  selectedCategory?: string;
  onCategoryChange?: (value: string) => void;
}

export function IngredientFilters({
  search,
  onSearchChange,
  stockStatus,
  onStockStatusChange,
  totalIngredients,
  filteredCount,
  lowStockCount,
  criticalStockCount,
  categories = [],
  selectedCategory,
  onCategoryChange,
}: IngredientFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, codigo ou EAN..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        {categories.length > 0 && onCategoryChange && (
          <Select value={selectedCategory ?? "all"} onValueChange={onCategoryChange}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            {/* Muitas categorias: sem altura máxima a lista estoura a tela. */}
            <SelectContent className="max-h-72">
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={stockStatus} onValueChange={onStockStatusChange}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Status do estoque" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ok">Estoque OK</SelectItem>
            <SelectItem value="low">Estoque Baixo</SelectItem>
            <SelectItem value="critical">Critico</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {filteredCount} de {totalIngredients} insumos
        </Badge>
        {criticalStockCount > 0 && (
          <Badge variant="destructive">
            {criticalStockCount} crítico{criticalStockCount > 1 ? 's' : ''}
          </Badge>
        )}
        {lowStockCount > 0 && (
          <Badge variant="secondary" className="border-yellow-500">
            {lowStockCount} com estoque baixo
          </Badge>
        )}
      </div>
    </div>
  );
}
