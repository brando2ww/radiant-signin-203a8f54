import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Star,
  Check,
  Calendar,
  Truck,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QuotationRequest, usePDVQuotations } from "@/hooks/use-pdv-quotations";
import { formatCurrency } from "@/lib/whatsapp-message";

interface QuotationComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: QuotationRequest;
}

interface ScoreBreakdown {
  price: number;
  expiration: number;
  delivery: number;
  total: number;
}

interface ComparisonResponse {
  id: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  totalPrice: number;
  expirationDate: string | null;
  deliveryDays: number | null;
  minimumOrder: number | null;
  paymentTerms: string | null;
  brand: string | null;
  conservation: string | null;
  origin: string | null;
  notes: string | null;
  isWinner: boolean;
  score: number;
  breakdown: ScoreBreakdown;
}

const CONSERVATION_LABELS: Record<string, string> = {
  resfriado: "Resfriado",
  congelado: "Congelado",
  ambiente: "Ambiente (seco)",
};

interface ComparisonRow {
  itemId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  responses: ComparisonResponse[];
}

const WEIGHTS = { price: 0.4, expiration: 0.3, delivery: 0.3 };

/**
 * Cada critério vira uma nota de 0 a 100 comparando a proposta com as demais
 * do MESMO item: o melhor valor recebe 100, o pior 0, o resto é interpolado.
 * Quem não informou o dado fica com 50 (neutro). A nota final é a média
 * ponderada: preço 40%, validade 30%, prazo 30%.
 */
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
): ScoreBreakdown {
  // Preço (40%) — menor é melhor
  const prices = allResponses.map((r) => r.unitPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceScore =
    maxPrice === minPrice
      ? 100
      : ((maxPrice - response.unitPrice) / (maxPrice - minPrice)) * 100;

  // Validade (30%) — mais longe é melhor
  let expirationScore = 50;
  if (response.expirationDate) {
    const expirations = allResponses
      .filter((r) => r.expirationDate)
      .map((r) => parseISO(r.expirationDate!).getTime());
    if (expirations.length > 0) {
      const minExp = Math.min(...expirations);
      const maxExp = Math.max(...expirations);
      const thisExp = parseISO(response.expirationDate).getTime();
      expirationScore =
        maxExp === minExp ? 100 : ((thisExp - minExp) / (maxExp - minExp)) * 100;
    }
  }

  // Prazo de entrega (30%) — mais rápido é melhor
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

  return {
    price: priceScore,
    expiration: expirationScore,
    delivery: deliveryScore,
    total:
      priceScore * WEIGHTS.price +
      expirationScore * WEIGHTS.expiration +
      deliveryScore * WEIGHTS.delivery,
  };
}

function getStars(score: number) {
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
}

function ScoreTooltip({ breakdown }: { breakdown: ScoreBreakdown }) {
  const lines = [
    { label: "Preço", weight: "40%", value: breakdown.price },
    { label: "Validade", weight: "30%", value: breakdown.expiration },
    { label: "Prazo de entrega", weight: "30%", value: breakdown.delivery },
  ];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            ({Math.round(breakdown.total)}%)
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="w-64">
          <p className="mb-2 text-xs">
            Nota de 0 a 100 comparando esta proposta com as outras do mesmo item.
            Em cada critério, a melhor proposta recebe 100 e a pior 0.
          </p>
          <div className="space-y-1">
            {lines.map((l) => (
              <div key={l.label} className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  {l.label} ({l.weight})
                </span>
                <span className="font-medium">{Math.round(l.value)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-3 border-t pt-1 text-xs font-semibold">
              <span>Score final</span>
              <span>{Math.round(breakdown.total)}%</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ResponseDetails({ response }: { response: ComparisonResponse }) {
  const fields: Array<{ label: string; value: string | null }> = [
    {
      label: "Validade",
      value: response.expirationDate
        ? format(parseISO(response.expirationDate), "dd/MM/yyyy", { locale: ptBR })
        : null,
    },
    {
      label: "Prazo de entrega",
      value:
        response.deliveryDays !== null ? `${response.deliveryDays} dia(s)` : null,
    },
    {
      label: "Pedido mínimo",
      value: response.minimumOrder !== null ? formatCurrency(response.minimumOrder) : null,
    },
    { label: "Condições de pagamento", value: response.paymentTerms },
    { label: "Marca", value: response.brand },
    {
      label: "Conservação",
      value: response.conservation
        ? (CONSERVATION_LABELS[response.conservation] ?? response.conservation)
        : null,
    },
    { label: "Origem", value: response.origin },
    { label: "Observações", value: response.notes },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t bg-muted/30 px-4 py-3 sm:grid-cols-3">
      {fields.map((f) => (
        <div key={f.label}>
          <p className="text-xs text-muted-foreground">{f.label}</p>
          <p className="text-sm">{f.value || "Não informado"}</p>
        </div>
      ))}
    </div>
  );
}

export function QuotationComparisonDialog({
  open,
  onOpenChange,
  quotation,
}: QuotationComparisonDialogProps) {
  const { setWinner } = usePDVQuotations();
  const [step, setStep] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const comparisonData = useMemo<ComparisonRow[]>(() => {
    if (!quotation.items) return [];

    return quotation.items.map((item) => {
      const raw =
        item.responses?.map((r) => ({
          id: r.id,
          supplierId: r.supplier_id,
          supplierName: r.supplier?.name || "Fornecedor",
          unitPrice: r.unit_price || 0,
          totalPrice: r.total_price || 0,
          expirationDate: r.expiration_date,
          deliveryDays: r.delivery_days,
          minimumOrder: r.minimum_order,
          paymentTerms: r.payment_terms,
          brand: r.brand,
          conservation: r.conservation,
          origin: r.origin,
          notes: r.notes,
          isWinner: r.is_winner,
        })) || [];

      const responses: ComparisonResponse[] = raw
        .map((r) => {
          const breakdown = calculateScore(r, raw);
          return { ...r, breakdown, score: breakdown.total };
        })
        .sort((a, b) => b.score - a.score);

      return {
        itemId: item.id,
        ingredientName: item.ingredient?.name || "",
        quantity: item.quantity_needed,
        unit: item.unit,
        responses,
      };
    });
  }, [quotation.items]);

  // Reabrir sempre começa do primeiro item
  useEffect(() => {
    if (open) {
      setStep(0);
      setExpandedId(null);
    }
  }, [open]);

  const total = comparisonData.length;
  const current = comparisonData[Math.min(step, Math.max(total - 1, 0))];
  const isLast = step >= total - 1;
  const decided = comparisonData.filter((r) =>
    r.responses.some((resp) => resp.isWinner)
  ).length;

  const handleSetWinner = (responseId: string, itemId: string) => {
    setWinner.mutate({ responseId, quotationItemId: itemId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            Comparativo de Cotações - {quotation.request_number}
          </DialogTitle>
          {total > 0 && (
            <p className="text-sm text-muted-foreground">
              Item {step + 1} de {total} · {decided} de {total} já decidido(s)
            </p>
          )}
        </DialogHeader>

        {total === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <ShoppingCart className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>Nenhuma resposta registrada ainda.</p>
          </div>
        ) : (
          <>
            {/* Passos */}
            <div className="flex shrink-0 gap-1">
              {comparisonData.map((row, i) => {
                const done = row.responses.some((r) => r.isWinner);
                return (
                  <button
                    key={row.itemId}
                    type="button"
                    onClick={() => {
                      setStep(i);
                      setExpandedId(null);
                    }}
                    title={row.ingredientName}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i === step
                        ? "bg-primary"
                        : done
                          ? "bg-primary/40"
                          : "bg-muted"
                    }`}
                  />
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-lg font-semibold">
                  {current.ingredientName}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({current.quantity} {current.unit})
                  </span>
                </h4>
                {current.responses.some((r) => r.isWinner) && (
                  <Badge variant="outline" className="shrink-0">
                    <Check className="mr-1 h-3 w-3" />
                    Vencedor definido
                  </Badge>
                )}
              </div>

              {current.responses.length === 0 ? (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                  Aguardando respostas dos fornecedores para este item.
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {current.responses.map((response, index) => {
                    const isExpanded = expandedId === response.id;
                    return (
                      <div
                        key={response.id}
                        className={response.isWinner ? "bg-primary/5" : ""}
                      >
                        <div className="flex items-center gap-3 p-3">
                          <div className="w-8 text-center">
                            {index === 0 ? (
                              <Badge variant="default" className="text-xs">
                                1º
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {index + 1}º
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="truncate font-medium">
                                {response.supplierName}
                              </span>
                              {/* Um mesmo fornecedor pode aparecer várias vezes,
                                  uma por marca — sem estes selos as linhas ficam
                                  indistinguíveis. */}
                              {response.brand && (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {response.brand}
                                </Badge>
                              )}
                              {response.conservation && (
                                <Badge variant="outline" className="text-xs font-normal">
                                  {CONSERVATION_LABELS[response.conservation] ??
                                    response.conservation}
                                </Badge>
                              )}
                              {response.isWinner && (
                                <Badge variant="outline" className="text-xs">
                                  <Check className="mr-1 h-3 w-3" />
                                  Vencedor
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {getStars(response.score)}
                              <span className="ml-1">
                                <ScoreTooltip breakdown={response.breakdown} />
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-semibold">
                              {formatCurrency(response.unitPrice)}/{current.unit}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Total: {formatCurrency(response.totalPrice)}
                            </div>
                          </div>

                          <div className="hidden w-28 text-right sm:block">
                            <div className="flex items-center justify-end gap-1 text-sm">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span>
                                {response.expirationDate
                                  ? format(
                                      parseISO(response.expirationDate),
                                      "dd/MM/yy",
                                      { locale: ptBR }
                                    )
                                  : "—"}
                              </span>
                            </div>
                            <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                              <Truck className="h-3 w-3" />
                              <span>
                                {response.deliveryDays !== null
                                  ? `${response.deliveryDays}d`
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ver todos os detalhes da proposta"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : response.id)
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>

                          <div className="w-28">
                            {!response.isWinner && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleSetWinner(response.id, current.itemId)
                                }
                                disabled={setWinner.isPending}
                              >
                                <Check className="mr-1 h-3 w-3" />
                                Selecionar
                              </Button>
                            )}
                          </div>
                        </div>

                        {isExpanded && <ResponseDetails response={response} />}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="pt-3 text-xs text-muted-foreground">
                <strong>Score:</strong> nota de 0 a 100 que compara cada proposta
                com as outras do mesmo item · preço (40%), validade (30%) e prazo
                de entrega (30%). Passe o mouse sobre a porcentagem para ver a
                composição.
              </p>
            </div>

            <DialogFooter className="shrink-0 gap-2 sm:justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep((s) => Math.max(0, s - 1));
                  setExpandedId(null);
                }}
                disabled={step === 0}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Anterior
              </Button>

              {isLast ? (
                <Button onClick={() => onOpenChange(false)}>Concluir</Button>
              ) : (
                <Button
                  onClick={() => {
                    setStep((s) => Math.min(total - 1, s + 1));
                    setExpandedId(null);
                  }}
                >
                  Próximo item
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
