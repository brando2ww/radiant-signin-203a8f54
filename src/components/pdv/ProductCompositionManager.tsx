import { useEffect, useState } from "react";
import { useCompositionGroups, type CompositionGroup } from "@/hooks/use-pdv-composition-groups";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatBRL } from "@/lib/format";
import {
  AlertTriangle,
  Info,
  Layers,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProductCompositionManagerProps {
  productId: string;
  productPrice: number;
  isComposite: boolean;
  stockDeductionMode: string;
  onCompositeChange: (value: boolean) => void;
  onStockDeductionModeChange: (value: string) => void;
}

export function ProductCompositionManager({
  productId,
  productPrice,
  isComposite,
  stockDeductionMode,
  onCompositeChange,
  onStockDeductionModeChange,
}: ProductCompositionManagerProps) {
  const {
    groups,
    isLoading,
    createGroup,
    updateGroup,
    deleteGroup,
    addItem,
    updateItemQuantity,
    removeItem,
  } = useCompositionGroups(productId);
  const { products } = usePDVProducts();
  const [newGroupName, setNewGroupName] = useState("");
  const [openSearchGroup, setOpenSearchGroup] = useState<string | null>(null);

  const allItems = groups.flatMap((g) => g.items);
  const compositionCost = allItems.reduce(
    (sum, item) => sum + (item.child_product?.price_salon || 0) * item.quantity,
    0,
  );
  const margin = productPrice - compositionCost;
  const marginPercent = productPrice > 0 ? (margin / productPrice) * 100 : 0;

  const handleCreateGroup = () => {
    const name = newGroupName.trim() || "Novo grupo";
    createGroup.mutate({
      parent_product_id: productId,
      name,
      type: "single",
      is_required: false,
      min_selections: 0,
      max_selections: 1,
      order_position: groups.length,
    });
    setNewGroupName("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base font-medium">Produto Composto</Label>
          <p className="text-sm text-muted-foreground">
            Este produto é montado a partir de outros produtos cadastrados
          </p>
        </div>
        <Switch checked={isComposite} onCheckedChange={onCompositeChange} />
      </div>

      {!isComposite ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <Layers className="h-10 w-10" />
          <p className="text-sm">
            Ative para montar este produto a partir de sub-produtos
          </p>
        </div>
      ) : (
        <>
          {/* Add group */}
          <div className="flex gap-2">
            <Input
              placeholder="Nome do grupo (ex: Escolha a proteína)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateGroup();
                }
              }}
            />
            <Button
              type="button"
              onClick={handleCreateGroup}
              disabled={createGroup.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo grupo
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : groups.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm border rounded-md border-dashed">
              <Plus className="h-6 w-6 mx-auto mb-2" />
              Nenhum grupo de composição. Crie um para começar.
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  productId={productId}
                  availableProducts={products.filter(
                    (p) =>
                      p.id !== productId &&
                      !group.items.some((c) => c.child_product_id === p.id),
                  )}
                  searchOpen={openSearchGroup === group.id}
                  onSearchOpenChange={(open) =>
                    setOpenSearchGroup(open ? group.id : null)
                  }
                  onUpdateGroup={(patch) =>
                    updateGroup.mutate({ id: group.id, ...patch })
                  }
                  onDeleteGroup={() => deleteGroup.mutate(group.id)}
                  onAddItem={(childProductId) =>
                    addItem.mutate({
                      groupId: group.id,
                      parentProductId: productId,
                      childProductId,
                    })
                  }
                  onUpdateItemQty={(id, quantity) =>
                    updateItemQuantity.mutate({ id, quantity })
                  }
                  onRemoveItem={(id) => removeItem.mutate(id)}
                />
              ))}
            </div>
          )}

          {/* Totals */}
          {allItems.length > 0 && (
            <div className="border rounded-lg p-4 space-y-2 bg-muted/20">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Custo da composição</span>
                <span className="font-medium">{formatBRL(compositionCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Preço de venda</span>
                <span className="font-medium">{formatBRL(productPrice)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Margem estimada</span>
                <span
                  className={`font-bold ${margin >= 0 ? "text-emerald-600" : "text-destructive"}`}
                >
                  {formatBRL(margin)} ({marginPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}

          {/* Stock deduction mode */}
          <div>
            <Label className="mb-2 block">Baixa de estoque ao vender</Label>
            <Select
              value={stockDeductionMode}
              onValueChange={onStockDeductionModeChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">
                  Baixar estoque do produto principal
                </SelectItem>
                <SelectItem value="components">
                  Baixar estoque de cada sub-produto
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              A tributação utilizada na venda é a do produto principal. Os
              sub-produtos mantêm seus próprios cadastros fiscais para uso
              individual.
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

interface GroupCardProps {
  group: CompositionGroup;
  productId: string;
  availableProducts: any[];
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  onUpdateGroup: (patch: Partial<CompositionGroup>) => void;
  onDeleteGroup: () => void;
  onAddItem: (childProductId: string) => void;
  onUpdateItemQty: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
}

function GroupCard({
  group,
  availableProducts,
  searchOpen,
  onSearchOpenChange,
  onUpdateGroup,
  onDeleteGroup,
  onAddItem,
  onUpdateItemQty,
  onRemoveItem,
}: GroupCardProps) {
  const [localName, setLocalName] = useState(group.name);
  const [localMin, setLocalMin] = useState(String(group.min_selections));
  const [localMax, setLocalMax] = useState(String(group.max_selections));

  useEffect(() => setLocalName(group.name), [group.name]);
  useEffect(() => setLocalMin(String(group.min_selections)), [group.min_selections]);
  useEffect(() => setLocalMax(String(group.max_selections)), [group.max_selections]);

  const commitName = () => {
    const v = localName.trim();
    if (v && v !== group.name) onUpdateGroup({ name: v });
    else if (!v) setLocalName(group.name);
  };
  const commitMin = () => {
    const n = Number(localMin) || 0;
    if (n !== group.min_selections) onUpdateGroup({ min_selections: n });
  };
  const commitMax = () => {
    const n = Number(localMax) || 1;
    if (n !== group.max_selections) onUpdateGroup({ max_selections: n });
  };

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-card">
      {/* Group header config */}
      <div className="space-y-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Nome do grupo</Label>
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive shrink-0"
            onClick={onDeleteGroup}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-48">
            <Label className="text-xs">Tipo</Label>
            <Select
              value={group.type}
              onValueChange={(v) =>
                onUpdateGroup({
                  type: v,
                  ...(v === "single"
                    ? { min_selections: group.is_required ? 1 : 0, max_selections: 1 }
                    : {}),
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Escolha única</SelectItem>
                <SelectItem value="multiple">Múltipla escolha</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {group.type === "multiple" && (
            <>
              <div className="w-20">
                <Label className="text-xs">Mín.</Label>
                <Input
                  type="number"
                  min={0}
                  value={localMin}
                  onChange={(e) => setLocalMin(e.target.value)}
                  onBlur={commitMin}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                />
              </div>
              <div className="w-20">
                <Label className="text-xs">Máx.</Label>
                <Input
                  type="number"
                  min={1}
                  value={localMax}
                  onChange={(e) => setLocalMax(e.target.value)}
                  onBlur={commitMax}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 h-10">
            <Switch
              checked={group.is_required}
              onCheckedChange={(checked) =>
                onUpdateGroup({
                  is_required: checked,
                  ...(group.type === "single"
                    ? { min_selections: checked ? 1 : 0 }
                    : {}),
                })
              }
            />
            <Label className="text-xs">Obrigatório</Label>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {group.items.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-xs border rounded-md border-dashed">
            Nenhum sub-produto neste grupo
          </div>
        ) : (
          group.items.map((comp) => {
            const child = comp.child_product;
            const unitPrice = child?.price_salon || 0;
            const totalPrice = unitPrice * comp.quantity;
            const childIsComposite = (child as any)?.is_composite;
            const childMissingStation =
              !!child && !(child as any)?.printer_station;

            return (
              <div
                key={comp.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {child?.name || "Produto removido"}
                    </span>
                    {childIsComposite && (
                      <Badge variant="outline" className="text-xs gap-1 shrink-0">
                        <AlertTriangle className="h-3 w-3" />
                        Composto
                      </Badge>
                    )}
                    {childMissingStation && (
                      <Badge
                        variant="outline"
                        className="text-xs gap-1 shrink-0 border-destructive/40 text-destructive"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Sem centro de produção
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <QuantityInput
                    value={comp.quantity}
                    onCommit={(n) => onUpdateItemQty(comp.id, n)}
                  />
                  <span className="text-xs text-muted-foreground w-8">un</span>
                </div>

                <div className="text-right shrink-0 w-24">
                  <p className="text-xs text-muted-foreground">
                    {formatBRL(unitPrice)}/un
                  </p>
                  <p className="text-sm font-medium">{formatBRL(totalPrice)}</p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => onRemoveItem(comp.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}

        <Popover open={searchOpen} onOpenChange={onSearchOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
            >
              <Search className="h-4 w-4" />
              Adicionar sub-produto...
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[350px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar por nome..." />
              <CommandList>
                <CommandEmpty>Nenhum produto encontrado</CommandEmpty>
                <CommandGroup>
                  {availableProducts.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.name}
                      onSelect={() => {
                        onAddItem(p.id);
                        onSearchOpenChange(false);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onAddItem(p.id);
                        onSearchOpenChange(false);
                      }}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{p.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatBRL(p.price_salon)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
