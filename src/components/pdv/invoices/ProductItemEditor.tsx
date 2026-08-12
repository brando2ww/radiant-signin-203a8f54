import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { EditableInvoiceItem, LinkActionType, NewIngredientData } from "@/types/invoice";
import { IngredientLinker } from "./IngredientLinker";
import { CurrencyInput } from "@/components/ui/currency-input";

interface ProductItemEditorProps {
  item: EditableInvoiceItem;
  onUpdate: (updates: Partial<EditableInvoiceItem>) => void;
  /** Ausente quando o item não pode ser removido (nota com um item só). */
  onRemove?: () => void;
}

export function ProductItemEditor({ item, onUpdate, onRemove }: ProductItemEditorProps) {
  const handleFieldChange = (field: keyof EditableInvoiceItem, value: any) => {
    onUpdate({ [field]: value });
  };

  const handleTaxChange = (taxField: keyof EditableInvoiceItem['taxes'], value: string) => {
    onUpdate({
      taxes: {
        ...item.taxes,
        [taxField]: parseFloat(value) || 0,
      },
    });
  };

  const handleLinkActionChange = (action: {
    type: LinkActionType;
    ingredientId?: string;
    newIngredientData?: NewIngredientData;
  }) => {
    onUpdate({ linkAction: action });
  };

  const getItemStatusColor = () => {
    switch (item.linkAction.type) {
      case 'link':
        return 'border-l-4 border-l-primary';
      case 'create':
        return 'border-l-4 border-l-secondary';
      default:
        if (item.suggestedIngredientIds && item.suggestedIngredientIds.length > 0) {
          return 'border-l-4 border-l-muted-foreground';
        }
        return 'border-l-4 border-l-destructive';
    }
  };

  return (
    <Card className={`p-4 ${getItemStatusColor()}`}>
      <div className="space-y-4">
        {/* Informações Básicas */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Item {item.itemNumber}</h4>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Remover este item"
                onClick={onRemove}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <Label htmlFor={`name-${item.itemNumber}`} className="text-xs">Nome do Produto</Label>
              <Input
                id={`name-${item.itemNumber}`}
                value={item.productName}
                onChange={(e) => handleFieldChange('productName', e.target.value)}
                className="h-8"
              />
            </div>

            <div>
              <Label htmlFor={`code-${item.itemNumber}`} className="text-xs">Código</Label>
              <Input
                id={`code-${item.itemNumber}`}
                value={item.productCode || ''}
                onChange={(e) => handleFieldChange('productCode', e.target.value)}
                className="h-8"
              />
            </div>

            <div>
              <Label htmlFor={`ean-${item.itemNumber}`} className="text-xs">EAN</Label>
              <Input
                id={`ean-${item.itemNumber}`}
                value={item.productEan || ''}
                onChange={(e) => handleFieldChange('productEan', e.target.value)}
                className="h-8"
              />
            </div>

            <div>
              <Label htmlFor={`ncm-${item.itemNumber}`} className="text-xs">NCM</Label>
              <Input
                id={`ncm-${item.itemNumber}`}
                value={item.ncm || ''}
                onChange={(e) => handleFieldChange('ncm', e.target.value)}
                className="h-8"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Quantidades e Valores */}
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label htmlFor={`quantity-${item.itemNumber}`} className="text-xs">Quantidade</Label>
            <Input
              id={`quantity-${item.itemNumber}`}
              type="number"
              step="0.01"
              value={item.quantity}
              onChange={(e) => handleFieldChange('quantity', parseFloat(e.target.value))}
              className="h-8"
            />
          </div>

          <div>
            <Label htmlFor={`unit-${item.itemNumber}`} className="text-xs">Unidade</Label>
            <Input
              id={`unit-${item.itemNumber}`}
              value={item.unit}
              onChange={(e) => handleFieldChange('unit', e.target.value)}
              className="h-8"
            />
          </div>

          <div>
            <Label htmlFor={`unit-value-${item.itemNumber}`} className="text-xs">Valor Unitário</Label>
            <CurrencyInput
              id={`unit-value-${item.itemNumber}`}
              value={item.unitValue.toString()}
              onChange={(value) => handleFieldChange('unitValue', parseFloat(value) || 0)}
              className="h-8"
            />
          </div>

          <div>
            <Label htmlFor={`total-value-${item.itemNumber}`} className="text-xs">Valor Total</Label>
            <CurrencyInput
              id={`total-value-${item.itemNumber}`}
              value={item.totalValue.toString()}
              onChange={(value) => handleFieldChange('totalValue', parseFloat(value) || 0)}
              className="h-8"
            />
          </div>
        </div>

        <Separator />

        {/* Impostos */}
        <div>
          <Label className="text-xs mb-2 block">Impostos</Label>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label htmlFor={`icms-${item.itemNumber}`} className="text-xs text-muted-foreground">ICMS</Label>
              <CurrencyInput
                id={`icms-${item.itemNumber}`}
                value={(item.taxes.icms || 0).toString()}
                onChange={(value) => handleTaxChange('icms', value)}
                className="h-8"
              />
            </div>

            <div>
              <Label htmlFor={`ipi-${item.itemNumber}`} className="text-xs text-muted-foreground">IPI</Label>
              <CurrencyInput
                id={`ipi-${item.itemNumber}`}
                value={(item.taxes.ipi || 0).toString()}
                onChange={(value) => handleTaxChange('ipi', value)}
                className="h-8"
              />
            </div>

            <div>
              <Label htmlFor={`pis-${item.itemNumber}`} className="text-xs text-muted-foreground">PIS</Label>
              <CurrencyInput
                id={`pis-${item.itemNumber}`}
                value={(item.taxes.pis || 0).toString()}
                onChange={(value) => handleTaxChange('pis', value)}
                className="h-8"
              />
            </div>

            <div>
              <Label htmlFor={`cofins-${item.itemNumber}`} className="text-xs text-muted-foreground">COFINS</Label>
              <CurrencyInput
                id={`cofins-${item.itemNumber}`}
                value={(item.taxes.cofins || 0).toString()}
                onChange={(value) => handleTaxChange('cofins', value)}
                className="h-8"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Vinculação de Ingrediente */}
        <IngredientLinker
          itemName={item.productName}
          itemCode={item.productCode}
          itemEan={item.productEan}
          itemUnit={item.unit}
          itemUnitCost={item.unitValue}
          linkAction={item.linkAction}
          suggestedIngredientIds={item.suggestedIngredientIds}
          autoMatched={item.autoMatched}
          onLinkChange={handleLinkActionChange}
        />
      </div>
    </Card>
  );
}