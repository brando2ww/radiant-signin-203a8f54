import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export type StatusFilter = "all" | "active" | "inactive" | "expired";
export type TypeFilter = "all" | "percentage" | "fixed";
export type SortBy = "created" | "most_used" | "valid_until";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  status: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
  type: TypeFilter;
  onTypeChange: (v: TypeFilter) => void;
  sort: SortBy;
  onSortChange: (v: SortBy) => void;
}

export function CouponsFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  type,
  onTypeChange,
  sort,
  onSortChange,
}: Props) {
  return (
    <div className="flex flex-col md:flex-row gap-2 md:items-center">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={status} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
        <SelectTrigger className="w-full md:w-44">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="active">Ativos</SelectItem>
          <SelectItem value="inactive">Inativos</SelectItem>
          <SelectItem value="expired">Vencidos</SelectItem>
        </SelectContent>
      </Select>
      <Select value={type} onValueChange={(v) => onTypeChange(v as TypeFilter)}>
        <SelectTrigger className="w-full md:w-40">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os tipos</SelectItem>
          <SelectItem value="percentage">Percentual</SelectItem>
          <SelectItem value="fixed">Valor fixo</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sort} onValueChange={(v) => onSortChange(v as SortBy)}>
        <SelectTrigger className="w-full md:w-48">
          <SelectValue placeholder="Ordenar por" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="created">Mais recentes</SelectItem>
          <SelectItem value="most_used">Mais usados</SelectItem>
          <SelectItem value="valid_until">Validade</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
