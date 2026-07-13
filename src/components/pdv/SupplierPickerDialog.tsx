import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Search } from "lucide-react";

interface SupplierOption {
  id: string;
  name: string;
}

interface SupplierPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierOption[];
  /** Fornecedores já vinculados ao insumo */
  selectedIds: string[];
  /** Recebe a lista completa de fornecedores selecionados */
  onConfirm: (supplierIds: string[]) => void;
  onNewSupplier: () => void;
}

export function SupplierPickerDialog({
  open,
  onOpenChange,
  suppliers,
  selectedIds,
  onConfirm,
  onNewSupplier,
}: SupplierPickerDialogProps) {
  const [search, setSearch] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);

  // Reabre sempre partindo do que está vinculado hoje
  useEffect(() => {
    if (open) {
      setDraftIds(selectedIds);
      setSearch("");
    }
  }, [open, selectedIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(term));
  }, [suppliers, search]);

  const toggle = (id: string) => {
    setDraftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    onConfirm(draftIds);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fornecedores do insumo</DialogTitle>
          <DialogDescription>
            Marque um ou mais fornecedores. O preferencial é definido na estrela,
            depois de salvar a seleção.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fornecedor..."
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-64 rounded-md border">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {suppliers.length === 0
                ? "Nenhum fornecedor ativo cadastrado."
                : "Nenhum fornecedor encontrado para essa busca."}
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((supplier) => {
                const checked = draftIds.includes(supplier.id);
                return (
                  <label
                    key={supplier.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(supplier.id)}
                    />
                    <span className="flex-1 truncate text-sm">{supplier.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={onNewSupplier}
          >
            <Plus className="h-4 w-4" />
            Novo fornecedor
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirm}>
              {draftIds.length > 0
                ? `Selecionar (${draftIds.length})`
                : "Selecionar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
