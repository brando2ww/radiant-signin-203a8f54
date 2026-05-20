import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export const SUPPLIER_CATEGORIES = [
  "Hortifruti",
  "Carnes",
  "Bebidas",
  "Secos",
  "Limpeza",
  "Embalagens",
  "Outros",
];

export type SupplierSortBy = "name_asc" | "name_desc" | "recent" | "volume";

interface SupplierFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  sortBy: SupplierSortBy;
  onSortByChange: (value: SupplierSortBy) => void;
  extraCategories: string[];
  totalSuppliers: number;
  filteredCount: number;
}

export function SupplierFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  sortBy,
  onSortByChange,
  extraCategories,
  totalSuppliers,
  filteredCount,
}: SupplierFiltersProps) {
  const allCategories = Array.from(
    new Set([...SUPPLIER_CATEGORIES, ...extraCategories.filter(Boolean)])
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-5 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CNPJ ou contato..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="md:col-span-3">
          <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
            <SelectTrigger>
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {allCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SupplierSortBy)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">A - Z</SelectItem>
              <SelectItem value="name_desc">Z - A</SelectItem>
              <SelectItem value="recent">Mais recente</SelectItem>
              <SelectItem value="volume">Maior volume de compras</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Exibindo {filteredCount} de {totalSuppliers} fornecedores
      </div>
    </div>
  );
}
