import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { CustomerDateFilters } from "@/lib/customer-consumption";

interface CustomerFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (v: string) => void;
  totalCount: number;
  filteredCount: number;
  dates: CustomerDateFilters;
  onDatesChange: (filters: CustomerDateFilters) => void;
}

export function CustomerFilters({ search, onSearchChange, sourceFilter, onSourceFilterChange, totalCount, filteredCount, dates, onDatesChange }: CustomerFiltersProps) {
  return (
    <div className="space-y-3">
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      <div className="relative flex-1 w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou e-mail..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={sourceFilter} onValueChange={onSourceFilterChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Canal de consumo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="pdv">Salão</SelectItem>
          <SelectItem value="delivery">Delivery</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {filteredCount} de {totalCount} clientes
      </span>
    </div>
      <div className="flex flex-wrap items-end gap-3">
        {([
          ["consumedFrom", "Consumo de"], ["consumedTo", "Consumo até"],
          ["expiresFrom", "Cashback vence de"], ["expiresTo", "Cashback vence até"],
        ] as const).map(([key, label]) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`customer-${key}`} className="text-xs">{label}</Label>
            <Input id={`customer-${key}`} type="date" className="w-40" value={dates[key]} onChange={(event) => onDatesChange({ ...dates, [key]: event.target.value })} />
          </div>
        ))}
        <Button variant={dates.cashbackOnly ? "default" : "outline"} aria-pressed={dates.cashbackOnly} onClick={() => onDatesChange({ ...dates, cashbackOnly: !dates.cashbackOnly })}>
          Com cashback ativo
        </Button>
        {(search || sourceFilter !== "all" || dates.consumedFrom || dates.consumedTo || dates.expiresFrom || dates.expiresTo || dates.cashbackOnly) && (
          <Button variant="ghost" onClick={() => {
            onSearchChange(""); onSourceFilterChange("all");
            onDatesChange({ source: "all", consumedFrom: "", consumedTo: "", expiresFrom: "", expiresTo: "", cashbackOnly: false });
          }}>Limpar filtros</Button>
        )}
      </div>
      {((dates.consumedFrom && dates.consumedTo && dates.consumedFrom > dates.consumedTo) || (dates.expiresFrom && dates.expiresTo && dates.expiresFrom > dates.expiresTo)) && (
        <p role="alert" className="text-sm text-destructive">A data inicial deve ser anterior ou igual à final.</p>
      )}
    </div>
  );
}
