import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Edit, MoreVertical, Trash2, AlertTriangle, Plus, Minus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PDVIngredient } from "@/hooks/use-pdv-ingredients";
import { format, parseISO, differenceInDays } from "date-fns";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { formatBRL } from "@/lib/format";

interface IngredientCardProps {
  ingredient: PDVIngredient;
  onEdit: (ingredient: PDVIngredient) => void;
  onDelete: (id: string) => void;
  onAdjustStock: (id: string, adjustment: number) => void;
}

export function IngredientCard({ ingredient, onEdit, onDelete, onAdjustStock }: IngredientCardProps) {
  const stockPercentage = ingredient.min_stock > 0 
    ? (ingredient.current_stock / ingredient.min_stock) * 100 
    : 100;
  
  // Sem mínimo definido não existe "estoque baixo": com min_stock = 0, a
  // comparação `estoque <= mínimo` marcava como baixo todo insumo zerado que
  // ninguém configurou — eram 68 dos 176 insumos num cliente, 84 em outro, o
  // que transformava o alerta em ruído e escondia a falta de verdade.
  const hasMinimum = ingredient.min_stock > 0;
  const isLowStock = hasMinimum && ingredient.current_stock <= ingredient.min_stock;
  const isCriticalStock = hasMinimum && ingredient.current_stock < ingredient.min_stock * 0.5;
  
  const lossImpact = ingredient.unit_cost * (ingredient.loss_percentage / 100);

  const getExpirationStatus = () => {
    if (!ingredient.expiration_date) return null;
    
    const daysUntilExpiration = differenceInDays(
      parseISO(ingredient.expiration_date),
      new Date()
    );

    if (daysUntilExpiration < 0) {
      return { label: "Vencido", variant: "destructive" as const, days: daysUntilExpiration };
    } else if (daysUntilExpiration <= 7) {
      return { label: "Vence em breve", variant: "destructive" as const, days: daysUntilExpiration };
    } else if (daysUntilExpiration <= 30) {
      return { label: "Atenção", variant: "secondary" as const, days: daysUntilExpiration };
    }
    return null;
  };

  const expirationStatus = getExpirationStatus();

  return (
    <Card className={`overflow-hidden ${isCriticalStock ? 'border-destructive' : isLowStock ? 'border-yellow-500' : ''}`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg truncate">{ingredient.name}</h3>
                {ingredient.code && (
                  <Badge variant="outline" className="text-xs">
                    #{ingredient.code}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {ingredient.category && <span>{ingredient.category}</span>}
                {ingredient.supplier?.name && (
                  <>
                    {ingredient.category && <span>•</span>}
                    <span className="truncate">{ingredient.supplier.name}</span>
                  </>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => deferMenuAction(() => onEdit(ingredient))}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => deferMenuAction(() => onDelete(ingredient.id))}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Estoque atual</span>
              <span className="font-bold">
                {ingredient.current_stock} {ingredient.unit}
              </span>
            </div>
            
            <Progress value={Math.min(stockPercentage, 100)} 
              className={isCriticalStock ? 'bg-destructive/20' : isLowStock ? 'bg-yellow-500/20' : ''} 
            />
            
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Mínimo: {ingredient.min_stock} {ingredient.unit}</span>
              <span>Custo Médio: {formatBRL(ingredient.average_cost)}</span>
            </div>
            {ingredient.current_balance > 0 && (
              <div className="text-xs text-muted-foreground">
                Saldo: {formatBRL(ingredient.current_balance)}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {isCriticalStock && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Crítico
              </Badge>
            )}
            {isLowStock && !isCriticalStock && (
              <Badge variant="secondary" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Baixo
              </Badge>
            )}
            {expirationStatus && (
              <Badge variant={expirationStatus.variant}>
                {expirationStatus.label}
                {expirationStatus.days >= 0 && ` (${expirationStatus.days}d)`}
              </Badge>
            )}
            {ingredient.expiration_date && !expirationStatus && (
              <Badge variant="outline">
                Validade: {format(parseISO(ingredient.expiration_date), "dd/MM/yyyy", { locale: ptBR })}
              </Badge>
            )}
            {ingredient.loss_percentage > 0 && (
              <Badge variant="secondary">
                Perda: {ingredient.loss_percentage}%
              </Badge>
            )}
            {ingredient.sector && (
              <Badge variant="outline">
                {ingredient.sector}
              </Badge>
            )}
            {ingredient.ean && (
              <Badge variant="outline" className="font-mono text-xs">
                EAN: {ingredient.ean}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex items-center justify-between border-t">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAdjustStock(ingredient.id, -1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAdjustStock(ingredient.id, 1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onEdit(ingredient)}>
          Ajustar
        </Button>
      </CardFooter>
    </Card>
  );
}
