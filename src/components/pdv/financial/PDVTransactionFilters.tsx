import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { usePDVCostCenters } from "@/hooks/use-pdv-cost-centers";
import { usePDVChartOfAccounts } from "@/hooks/use-pdv-chart-of-accounts";
import { usePDVSuppliers } from "@/hooks/use-pdv-suppliers";
import { usePDVCustomers } from "@/hooks/use-pdv-customers";
import type { TransactionFilters } from "@/hooks/use-pdv-financial-transactions";

interface PDVTransactionFiltersProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
}

export function PDVTransactionFilters({ filters, onFiltersChange }: PDVTransactionFiltersProps) {
  const { costCenters } = usePDVCostCenters();
  const { accounts } = usePDVChartOfAccounts();
  const { suppliers } = usePDVSuppliers();
  const { customers } = usePDVCustomers();

  const hasActiveFilters = Object.keys(filters).some(key => {
    const value = filters[key as keyof TransactionFilters];
    return value !== undefined && value !== '' && value !== 'all';
  });

  const clearFilters = () => {
    onFiltersChange({});
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição..."
            value={filters.search || ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="pl-9"
          />
        </div>

        <Select
          value={filters.transaction_type || 'all'}
          onValueChange={(value) => onFiltersChange({ ...filters, transaction_type: value === 'all' ? undefined : (value as any) })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="payable">A Pagar</SelectItem>
            <SelectItem value="receivable">A Receber</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.cost_center_id || 'all'}
          onValueChange={(value) => onFiltersChange({ ...filters, cost_center_id: value === 'all' ? undefined : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Centro de Custo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {costCenters.map((cc) => (
              <SelectItem key={cc.id} value={cc.id}>
                {cc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.chart_account_id || 'all'}
          onValueChange={(value) => onFiltersChange({ ...filters, chart_account_id: value === 'all' ? undefined : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Conta Contábil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.code} - {acc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Filtros ativos
          </p>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
