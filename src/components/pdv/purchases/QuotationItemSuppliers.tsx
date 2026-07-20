import { useMemo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePDVIngredientSuppliers } from "@/hooks/use-pdv-ingredient-suppliers";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, ChevronsUpDown, Search } from "lucide-react";

interface SupplierItem {
  id: string;
  supplier_id: string;
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    contact_name: string | null;
  };
  is_preferred: boolean;
  is_direct: boolean;
  /** Vinculado ao insumo (principal ou em pdv_ingredient_suppliers), não só um ativo qualquer da loja. */
  is_linked: boolean;
}

/** Número de contato do fornecedor: prioriza WhatsApp, cai para telefone. */
function supplierContactNumber(s: { whatsapp?: string | null; phone?: string | null }) {
  return (s.whatsapp && s.whatsapp.trim()) || (s.phone && s.phone.trim()) || "";
}

interface QuotationItemSuppliersProps {
  ingredientId: string;
  selectedSuppliers: string[];
  onSuppliersChange: (suppliers: string[]) => void;
}

export function QuotationItemSuppliers({
  ingredientId,
  selectedSuppliers,
  onSuppliersChange,
}: QuotationItemSuppliersProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { ingredientSuppliers, availableSuppliers, isLoading: isLoadingMultiple } = usePDVIngredientSuppliers(ingredientId);

  // Fetch the ingredient with its direct supplier
  const { data: ingredientData, isLoading: isLoadingDirect } = useQuery({
    queryKey: ['ingredient-direct-supplier', ingredientId],
    queryFn: async () => {
      if (!ingredientId) return null;
      const { data, error } = await supabase
        .from('pdv_ingredients')
        .select(`
          id,
          supplier_id,
          supplier:pdv_suppliers(id, name, phone, whatsapp, email, contact_name)
        `)
        .eq('id', ingredientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!ingredientId,
  });

  const isLoading = isLoadingMultiple || isLoadingDirect;

  // Combine suppliers from both sources (direct + multiple)
  const suppliers = useMemo((): SupplierItem[] => {
    const result: SupplierItem[] = [];
    
    // Add direct supplier from pdv_ingredients.supplier_id
    if (ingredientData?.supplier && typeof ingredientData.supplier === 'object' && !Array.isArray(ingredientData.supplier)) {
      const directSupplier = ingredientData.supplier as {
        id: string;
        name: string;
        phone: string | null;
        whatsapp: string | null;
        email: string | null;
        contact_name: string | null;
      };
      result.push({
        id: `direct-${directSupplier.id}`,
        supplier_id: directSupplier.id,
        supplier: directSupplier,
        is_preferred: true, // Direct supplier is primary
        is_direct: true,
        is_linked: true,
      });
    }
    
    // Add suppliers from pdv_ingredient_suppliers table
    ingredientSuppliers
      .filter((is) => is.ingredient_id === ingredientId && is.supplier)
      .forEach((is) => {
        // Avoid duplicates
        if (!result.some((r) => r.supplier_id === is.supplier_id)) {
          result.push({
            id: is.id,
            supplier_id: is.supplier_id,
            supplier: is.supplier!,
            is_preferred: is.is_preferred,
            is_direct: false,
            is_linked: true,
          });
        }
      });

    // Adiciona TODOS os demais fornecedores ativos (o lojista pode cotar com
    // qualquer fornecedor, não só os pré-vinculados ao ingrediente).
    (availableSuppliers ?? []).forEach((s: any) => {
      if (!result.some((r) => r.supplier_id === s.id)) {
        result.push({
          id: `all-${s.id}`,
          supplier_id: s.id,
          supplier: {
            id: s.id,
            name: s.name,
            phone: s.phone ?? null,
            whatsapp: s.whatsapp ?? null,
            email: s.email ?? null,
            contact_name: s.contact_name ?? null,
          },
          is_preferred: false,
          is_direct: false,
          is_linked: false,
        });
      }
    });

    return result;
  }, [ingredientData, ingredientSuppliers, availableSuppliers, ingredientId]);

  // Auto-seleciona, na primeira carga, TODOS os fornecedores vinculados ao insumo
  // (principal + os cadastrados em "Fornecedores" no produto), não só o preferido.
  // Os demais fornecedores da loja entram na lista mas ficam desmarcados.
  useEffect(() => {
    if (isLoading) return;
    if (suppliers.length > 0 && selectedSuppliers.length === 0) {
      const linkedIds = suppliers
        .filter((s) => s.is_linked && supplierContactNumber(s.supplier))
        .map((s) => s.supplier_id);
      if (linkedIds.length > 0) {
        onSuppliersChange(linkedIds);
      }
    }
  }, [isLoading, suppliers, selectedSuppliers.length, onSuppliersChange]);

  const handleToggle = (supplierId: string) => {
    if (selectedSuppliers.includes(supplierId)) {
      onSuppliersChange(selectedSuppliers.filter((id) => id !== supplierId));
    } else {
      onSuppliersChange([...selectedSuppliers, supplierId]);
    }
  };


  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground mt-2 pl-2">
        Carregando fornecedores...
      </div>
    );
  }

  if (!ingredientId) {
    return null;
  }

  if (suppliers.length === 0) {
    return (
      <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-400">
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>Nenhum fornecedor cadastrado. Cadastre em Compras → Fornecedores.</span>
      </div>
    );
  }

  const selectedCount = selectedSuppliers.length;
  const filtered = suppliers.filter((link) =>
    search.trim() === ""
      ? true
      : (link.supplier.name ?? "").toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="mt-2 pl-2 space-y-1">
      <span className="text-xs text-muted-foreground font-medium">Fornecedores:</span>

      {/* Gatilho: abre o modal dedicado de seleção */}
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between text-xs h-8"
        onClick={() => { setSearch(""); setOpen(true); }}
      >
        {selectedCount === 0
          ? "Selecione os fornecedores..."
          : `${selectedCount} fornecedor${selectedCount > 1 ? "es" : ""} selecionado${selectedCount > 1 ? "s" : ""}`}
        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
      </Button>

      {/* Resumo dos selecionados (chips), fora do modal */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {suppliers
            .filter((l) => selectedSuppliers.includes(l.supplier_id))
            .map((l) => (
              <Badge key={l.supplier_id} variant="secondary" className="text-[10px]">
                {l.supplier.name}
              </Badge>
            ))}
        </div>
      )}

      {/* Modal dedicado de seleção de fornecedores */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Selecionar fornecedores</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar fornecedor..."
              className="pl-8"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{selectedCount} selecionado(s)</span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                onSuppliersChange(
                  selectedCount === filtered.length ? [] : filtered.map((l) => l.supplier_id),
                )
              }
            >
              {selectedCount === filtered.length ? "Limpar todos" : "Selecionar todos"}
            </button>
          </div>

          <div className="max-h-[50vh] overflow-auto -mx-1 px-1 divide-y">
            {filtered.map((link) => {
              const supplier = link.supplier;
              const hasPhone = !!supplierContactNumber(supplier);
              const isSelected = selectedSuppliers.includes(link.supplier_id);
              return (
                <label
                  key={link.id}
                  className={`flex items-center gap-3 px-2 py-3 cursor-pointer select-none rounded ${
                    isSelected ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(link.supplier_id)}
                    className="h-4 w-4 accent-primary shrink-0"
                  />
                  <span className="flex-1 truncate text-sm">{supplier.name}</span>
                  {link.is_direct && (
                    <Badge variant="default" className="text-[10px] py-0 px-1">Principal</Badge>
                  )}
                  {link.is_preferred && !link.is_direct && (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1">Preferido</Badge>
                  )}
                  {link.is_linked && !link.is_direct && !link.is_preferred && (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1">Do produto</Badge>
                  )}
                  {!hasPhone && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1 text-amber-600">Sem WhatsApp</Badge>
                  )}
                </label>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Nenhum fornecedor encontrado.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Concluir ({selectedCount})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
