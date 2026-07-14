import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Star, Check, Calendar, Truck, DollarSign, ShoppingCart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QuotationRequest, usePDVQuotations } from "@/hooks/use-pdv-quotations";
import { formatCurrency } from "@/lib/whatsapp-message";

interface QuotationComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: QuotationRequest;
}

interface ComparisonRow {
  itemId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  responses: Array<{
    id: string;
    supplierId: string;
    supplierName: string;
    unitPrice: number;
    totalPrice: number;
    expirationDate: string | null;
    deliveryDays: number | null;
    isWinner: boolean;
    score: number;
  }>;
}

function calculateScore(
  response: {
    unitPrice: number;
    expirationDate: string | null;
    deliveryDays: number | null;
  },
  allResponses: Array<{
    unitPrice: number;
    expirationDate: string | null;
    deliveryDays: number | null;
  }>
): number {
  // Price score (40%) - lower is better
  const prices = allResponses.map((r) => r.unitPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceScore =
    maxPrice === minPrice
      ? 100
      : ((maxPrice - response.unitPrice) / (maxPrice - minPrice)) * 100;

  // Expiration score (30%) - later is better
  let expirationScore = 50;
  if (response.expirationDate) {
    const expirations = allResponses
      .filter((r) => r.expirationDate)
      .map((r) => new Date(r.expirationDate!).getTime());
    if (expirations.length > 0) {
      const minExp = Math.min(...expirations);
      const maxExp = Math.max(...expirations);
      const thisExp = new Date(response.expirationDate).getTime();
      expirationScore =
        maxExp === minExp
          ? 100
          : ((thisExp - minExp) / (maxExp - minExp)) * 100;
    }
  }

  // Delivery score (30%) - faster is better
  let deliveryScore = 50;
  if (response.deliveryDays !== null) {
    const deliveries = allResponses
      .filter((r) => r.deliveryDays !== null)
      .map((r) => r.deliveryDays!);
    if (deliveries.length > 0) {
      const minDel = Math.min(...deliveries);
      const maxDel = Math.max(...deliveries);
      deliveryScore =
        maxDel === minDel
          ? 100
          : ((maxDel - response.deliveryDays) / (maxDel - minDel)) * 100;
    }
  }

  return priceScore * 0.4 + expirationScore * 0.3 + deliveryScore * 0.3;
}

export function QuotationComparisonDialog({
  open,
  onOpenChange,
  quotation,
}: QuotationComparisonDialogProps) {
  const { setWinner } = usePDVQuotations();

  const comparisonData = useMemo<ComparisonRow[]>(() => {
    if (!quotation.items) return [];

    return quotation.items.map((item) => {
      const responses =
        item.responses?.map((r) => ({
          id: r.id,
          supplierId: r.supplier_id,
          supplierName: r.supplier?.name || "Fornecedor",
          unitPrice: r.unit_price || 0,
          totalPrice: r.total_price || 0,
          expirationDate: r.expiration_date,
          deliveryDays: r.delivery_days,
          isWinner: r.is_winner,
          score: 0,
        })) || [];

      // Calculate scores
      responses.forEach((r) => {
        r.score = calculateScore(r, responses);
      });

      // Sort by score (highest first)
      responses.sort((a, b) => b.score - a.score);

      return {
        itemId: item.id,
        ingredientName: item.ingredient?.name || "",
        quantity: item.quantity_needed,
        unit: item.unit,
        responses,
      };
    });
  }, [quotation.items]);

  const handleSetWinner = (responseId: string, itemId: string) => {
    setWinner.mutate({ responseId, quotationItemId: itemId });
  };

  const getStars = (score: number) => {
    const stars = Math.round(score / 20);
    return Array(5)
      .fill(0)
      .map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i < stars ? "fill-yellow-400 text-yellow-400" : "text-muted"
          }`}
        />
      ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Comparativo de Cotações - {quotation.request_number}</DialogTitle>
          {comparisonData.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {comparisonData.length}{" "}
              {comparisonData.length === 1 ? "item cotado" : "itens cotados"} · role
              para ver todos
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-6 pr-4">
            {comparisonData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma resposta registrada ainda.</p>
              </div>
            ) : (
              comparisonData.map((row) => (
                <div key={row.itemId} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 border-b">
                    <h4 className="font-semibold">
                      {row.ingredientName}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({row.quantity} {row.unit})
                      </span>
                    </h4>
                  </div>

                  {row.responses.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      Aguardando respostas dos fornecedores
                    </div>
                  ) : (
                    <div className="divide-y">
                      {row.responses.map((response, index) => (
                        <div
                          key={response.id}
                          className={`p-4 flex items-center gap-4 ${
                            response.isWinner ? "bg-primary/5" : ""
                          }`}
                        >
                          {/* Rank */}
                          <div className="w-8 text-center">
                            {index === 0 ? (
                              <Badge variant="default" className="text-xs">
                                1º
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                {index + 1}º
                              </span>
                            )}
                          </div>

                          {/* Supplier Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">
                                {response.supplierName}
                              </span>
                              {response.isWinner && (
                                <Badge variant="outline" className="text-xs">
                                  <Check className="h-3 w-3 mr-1" />
                                  Vencedor
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {getStars(response.score)}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({Math.round(response.score)}%)
                              </span>
                            </div>
                          </div>

                          {/* Price */}
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-sm">
                              <DollarSign className="h-3 w-3 text-muted-foreground" />
                              <span className="font-semibold">
                                {formatCurrency(response.unitPrice)}/{row.unit}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Total: {formatCurrency(response.totalPrice)}
                            </div>
                          </div>

                          {/* Expiration */}
                          <div className="w-24 text-right">
                            {response.expirationDate ? (
                              <div className="flex items-center gap-1 text-sm justify-end">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                <span>
                                  {format(new Date(response.expirationDate), "dd/MM", {
                                    locale: ptBR,
                                  })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>

                          {/* Delivery */}
                          <div className="w-20 text-right">
                            {response.deliveryDays !== null ? (
                              <div className="flex items-center gap-1 text-sm justify-end">
                                <Truck className="h-3 w-3 text-muted-foreground" />
                                <span>{response.deliveryDays}d</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>

                          {/* Action */}
                          <div className="w-28">
                            {!response.isWinner && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleSetWinner(response.id, row.itemId)
                                }
                                disabled={setWinner.isPending}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Selecionar
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="text-xs text-muted-foreground pt-4 border-t">
          <p>
            <strong>Score:</strong> Calculado com base em preço (40%), validade (30%) e
            prazo de entrega (30%).
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
