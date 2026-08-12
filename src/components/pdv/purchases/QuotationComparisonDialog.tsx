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
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  /** Preenchido quando o comprador corrigiu o preço enviado pelo fornecedor. */
  originalUnitPrice: number | null;
  score: number;
  breakdown: ScoreBreakdown;
}

/**
 * Erro de unidade (cotar por tonelada num item em kg, por caixa num item em
 * unidade) sempre aparece como uma ordem de grandeza de diferença. Comparo com
 * a MEDIANA das outras ofertas do item — média seria contaminada pelo próprio
 * outlier. Só vale com 3+ ofertas: com duas, não há como saber qual é a errada.
 */
const OUTLIER_FACTOR = 2;

type Outlier = { direction: "acima" | "abaixo"; factor: number };

function priceOutlier(price: number, allPrices: number[]): Outlier | null {
  const others = allPrices.filter((p) => p > 0 && p !== price);
  if (others.length < 2 || price <= 0) return null;
  const sorted = [...others].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (!(median > 0)) return null;
  if (price >= median * OUTLIER_FACTOR)
    return { direction: "acima", factor: price / median };
  if (price <= median / OUTLIER_FACTOR)
    return { direction: "abaixo", factor: median / price };
  return null;
}

/** 2,1× · 12× · 1.000× — sem casa decimal quando o fator é grande. */
const formatFactor = (factor: number) =>
  factor >= 10
    ? Math.round(factor).toLocaleString("pt-BR")
    : factor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const CONSERVATION_LABELS: Record<string, string> = {
  resfriado: "Resfriado",
  congelado: "Congelado",
  ambiente: "Ambiente (seco)",
};

interface UnavailableResponse {
  id: string;
  supplierName: string;
  reason: string;
  notes: string | null;
}

interface ComparisonRow {
  itemId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  responses: ComparisonResponse[];
  unavailable: UnavailableResponse[];
}

const UNAVAILABLE_LABELS: Record<string, string> = {
  sem_estoque: "sem estoque",
  nao_trabalha: "não trabalha com o item",
  em_falta: "em falta",
};

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

/**
 * Correção do preço enviado pelo fornecedor. Os atalhos existem porque o erro
 * quase nunca é de digitação e sim de unidade: tonelada num item em kg (÷1000),
 * caixa fechada num item por unidade (÷12, ÷6, ÷24).
 */
const CONVERSIONS = [
  { label: "÷ 1.000", factor: 1000, hint: "tonelada → kg" },
  { label: "÷ 24", factor: 24 },
  { label: "÷ 12", factor: 12, hint: "caixa → unidade" },
  { label: "÷ 6", factor: 6 },
];

function PriceCorrection({
  unit,
  quantity,
  value,
  onChange,
  saving,
  onCancel,
  onSave,
}: {
  unit: string;
  quantity: number;
  value: string;
  onChange: (v: string) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const parsed = parseFloat(value);
  const valid = parsed > 0;

  return (
    <div className="space-y-3 border-t bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Corrigir o preço por <strong>{unit}</strong>. O valor enviado pelo fornecedor
        fica guardado e aparece na linha.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <CurrencyInput
            value={value}
            onChange={onChange}
            className="h-9"
          />
        </div>
        {CONVERSIONS.map((c) => (
          <Button
            key={c.factor}
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            title={c.hint}
            disabled={!valid}
            onClick={() => onChange(String(parsed / c.factor))}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {valid ? (
            <>
              Fica <strong>{formatCurrency(parsed)}</strong>/{unit} · total{" "}
              <strong>{formatCurrency(parsed * quantity)}</strong> ({quantity} {unit})
            </>
          ) : (
            "Informe um valor maior que zero."
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSave} disabled={!valid || saving}>
            Salvar correção
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Quanto já foi fechado com este fornecedor na cotação e onde isso o deixa em
 * relação ao pedido mínimo dele. Para quem ainda não venceu o item, calcula se
 * escolher aqui resolveria o mínimo — é a resposta ao "priorizo ele ou não?".
 */
function SupplierRunningTotal({
  committed,
  minimum,
  lineTotal,
  isWinner,
}: {
  committed: number;
  minimum: number;
  lineTotal: number;
  isWinner: boolean;
}) {
  if (committed <= 0 && minimum <= 0) return null;

  const hasMinimum = minimum > 0;
  const below = hasMinimum && committed < minimum;
  const wouldClose = below && !isWinner && committed + lineTotal >= minimum;

  return (
    <p
      className={`mt-1 text-xs ${below ? "text-amber-700" : "text-muted-foreground"}`}
    >
      já fechado {formatCurrency(committed)}
      {hasMinimum && (
        <>
          {" · "}
          {below ? (
            <>
              mínimo {formatCurrency(minimum)} · faltam{" "}
              <strong>{formatCurrency(minimum - committed)}</strong>
            </>
          ) : (
            <>mínimo {formatCurrency(minimum)} atingido</>
          )}
        </>
      )}
      {wouldClose && (
        <span className="ml-1 font-medium text-emerald-700">
          · escolher aqui fecha o mínimo
        </span>
      )}
    </p>
  );
}

export function QuotationComparisonDialog({
  open,
  onOpenChange,
  quotation,
}: QuotationComparisonDialogProps) {
  const { setWinner, updateResponse } = usePDVQuotations();
  const [step, setStep] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const comparisonData = useMemo<ComparisonRow[]>(() => {
    if (!quotation.items) return [];

    return quotation.items.map((item) => {
      // Quem respondeu "não tenho" fica de fora do ranking: sem preço, ele
      // entraria como R$ 0,00 e ganharia de todo mundo.
      const unavailable =
        item.responses
          ?.filter((r) => r.unavailable_reason)
          .map((r) => ({
            id: r.id,
            supplierName: r.supplier?.name || "Fornecedor",
            reason: r.unavailable_reason as string,
            notes: r.notes,
          })) || [];

      const raw =
        item.responses
          ?.filter((r) => !r.unavailable_reason)
          .map((r) => ({
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
          originalUnitPrice: r.original_unit_price ?? null,
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
        unavailable,
      };
    });
  }, [quotation.items]);

  /**
   * O pedido mínimo é do fornecedor, não do item: só dá para saber se ele foi
   * atingido somando TODOS os itens em que aquele fornecedor foi escolhido.
   * Por isso o aviso vive fora da lista do item atual e recalcula a cada
   * vencedor marcado — é aqui que ainda dá para trocar a escolha.
   */
  const committed = useMemo(() => {
    const bySupplier = new Map<
      string,
      { id: string; name: string; total: number; items: number; minimum: number }
    >();
    (quotation.items ?? []).forEach((item) => {
      const win = item.responses?.find((r) => r.is_winner);
      if (!win?.supplier) return;
      const line = (Number(win.unit_price) || 0) * (Number(item.quantity_needed) || 0);
      const acc = bySupplier.get(win.supplier.id);
      if (acc) {
        acc.total += line;
        acc.items += 1;
      } else {
        bySupplier.set(win.supplier.id, {
          id: win.supplier.id,
          name: win.supplier.name,
          total: line,
          items: 1,
          minimum: Number(win.supplier.minimum_order ?? 0),
        });
      }
    });
    return bySupplier;
  }, [quotation.items]);

  /**
   * O mínimo do fornecedor só é conhecido pelo total dele na cotação inteira.
   * Numa cotação de 60+ itens ninguém guarda isso de cabeça, então o número
   * acompanha a decisão: fica na linha de cada fornecedor e no painel do rodapé.
   */
  const committedList = useMemo(
    () =>
      [...committed.values()].sort((a, b) => {
        const aBelow = a.minimum > 0 && a.total < a.minimum;
        const bBelow = b.minimum > 0 && b.total < b.minimum;
        if (aBelow !== bBelow) return aBelow ? -1 : 1; // quem falta bater vem antes
        return b.total - a.total;
      }),
    [committed],
  );

  const belowMinimum = useMemo(
    () => committedList.filter((s) => s.minimum > 0 && s.total < s.minimum),
    [committedList],
  );

  // Mínimo cadastrado de um fornecedor que ainda não venceu nada nesta cotação.
  const minimumOfSupplier = useMemo(() => {
    const map = new Map<string, number>();
    (quotation.items ?? []).forEach((item) =>
      item.responses?.forEach((r) => {
        if (r.supplier?.id) map.set(r.supplier.id, Number(r.supplier.minimum_order ?? 0));
      }),
    );
    return map;
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

  const handleCorrectPrice = (response: ComparisonResponse) => {
    const price = parseFloat(editPrice);
    if (!(price > 0)) {
      toast.error("Informe um preço maior que zero.");
      return;
    }
    if (price === response.unitPrice) {
      setEditingId(null);
      return;
    }
    updateResponse.mutate(
      {
        id: response.id,
        unit_price: price,
        total_price: price * current.quantity,
        // Só na primeira correção: corrigir de novo não pode apagar o número
        // original do fornecedor.
        ...(response.originalUnitPrice == null
          ? { original_unit_price: response.unitPrice }
          : {}),
        corrected_at: new Date().toISOString(),
      } as any,
      { onSuccess: () => setEditingId(null) },
    );
  };

  const isDecided = (row: ComparisonRow) => row.responses.some((r) => r.isWinner);

  // Numa cotação de 60+ itens, avançar de um em um para achar os que faltam é
  // inviável: pula direto para o próximo indeciso, dando a volta no fim da lista.
  const nextPendingStep = useMemo(() => {
    const order = [
      ...comparisonData.slice(step + 1).map((r, i) => ({ row: r, index: step + 1 + i })),
      ...comparisonData.slice(0, step + 1).map((r, i) => ({ row: r, index: i })),
    ];
    return order.find(({ row }) => !isDecided(row))?.index ?? null;
  }, [comparisonData, step]);

  const goTo = (index: number) => {
    setStep(index);
    setExpandedId(null);
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

            {/* Ir direto a um item pelo nome: com muitos itens, a fileira de
                passos acima vira um alvo de 3px por item. */}
            <div className="mt-2 flex shrink-0 items-center gap-2">
              <Select value={String(step)} onValueChange={(v) => goTo(Number(v))}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {comparisonData.map((row, i) => (
                    <SelectItem key={row.itemId} value={String(i)} className="text-xs">
                      {isDecided(row) ? "✓" : "○"} {i + 1}. {row.ingredientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nextPendingStep != null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => goTo(nextPendingStep)}
                >
                  Próximo pendente ({total - decided})
                </Button>
              )}
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
                  {current.unavailable.length > 0
                    ? "Nenhum fornecedor ofertou este item."
                    : "Aguardando respostas dos fornecedores para este item."}
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {current.responses.map((response, index) => {
                    const isExpanded = expandedId === response.id;
                    const outlier = priceOutlier(
                      response.unitPrice,
                      current.responses.map((r) => r.unitPrice),
                    );
                    return (
                      <div
                        key={response.id}
                        className={`border-l-4 ${
                          response.isWinner
                            ? "border-l-primary bg-primary/5"
                            : "border-l-transparent"
                        }`}
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

                          <div className="min-w-0 flex-1 space-y-1">
                            {/* 1 · quem é, e o estado da linha */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="truncate font-semibold">
                                {response.supplierName}
                              </span>
                              {response.isWinner && (
                                <Badge variant="outline" className="text-xs">
                                  <Check className="mr-1 h-3 w-3" />
                                  Vencedor
                                </Badge>
                              )}
                              {outlier && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-400 bg-amber-50 text-xs font-normal text-amber-800"
                                  title="Preço fora da curva em relação às outras ofertas deste item. Só linhas assim podem ser corrigidas."
                                >
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  {formatFactor(outlier.factor)}× {outlier.direction} das
                                  demais
                                </Badge>
                              )}
                              {response.originalUnitPrice != null && (
                                <Badge variant="outline" className="text-xs font-normal">
                                  corrigido · enviou{" "}
                                  {formatCurrency(response.originalUnitPrice)}/
                                  {current.unit}
                                </Badge>
                              )}
                            </div>

                            {/* 2 · a MARCA. Com duas ofertas do mesmo fornecedor
                                é a única coisa que distingue as linhas, então
                                ganha peso próprio em vez de virar mais um selo
                                cinza no meio dos outros. */}
                            <div className="flex flex-wrap items-center gap-2">
                              {response.brand ? (
                                <span className="rounded bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
                                  {response.brand}
                                </span>
                              ) : (
                                <span className="text-xs italic text-muted-foreground">
                                  marca não informada
                                </span>
                              )}
                              {response.conservation && (
                                <Badge variant="outline" className="text-xs font-normal">
                                  {CONSERVATION_LABELS[response.conservation] ??
                                    response.conservation}
                                </Badge>
                              )}
                            </div>

                            {/* 3 · o resto numa linha só. Antes estava espalhado
                                em três cantos e a coluna da direita exibia "—"
                                para dado inexistente, ocupando espaço à toa. */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                {getStars(response.score)}
                                <ScoreTooltip breakdown={response.breakdown} />
                              </span>
                              {response.deliveryDays !== null && (
                                <span className="flex items-center gap-1">
                                  <Truck className="h-3 w-3" />
                                  entrega em {response.deliveryDays}d
                                </span>
                              )}
                              {response.expirationDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  val.{" "}
                                  {format(parseISO(response.expirationDate), "dd/MM/yy", {
                                    locale: ptBR,
                                  })}
                                </span>
                              )}
                            </div>

                            <SupplierRunningTotal
                              committed={committed.get(response.supplierId)?.total ?? 0}
                              minimum={
                                committed.get(response.supplierId)?.minimum ??
                                minimumOfSupplier.get(response.supplierId) ??
                                0
                              }
                              lineTotal={response.unitPrice * current.quantity}
                              isWinner={response.isWinner}
                            />
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-base font-bold leading-tight">
                              {formatCurrency(response.unitPrice)}
                              <span className="text-xs font-normal text-muted-foreground">
                                /{current.unit}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              total {formatCurrency(response.totalPrice)}
                            </div>
                          </div>

                          {/* Correção só é liberada em preço fora da curva: sem
                              essa trava, editar preço alheio vira rotina em vez
                              de exceção. O selo ao lado do nome explica o porquê. */}
                          <div className="w-10 shrink-0">
                            {(outlier || response.originalUnitPrice != null) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Corrigir o preço enviado pelo fornecedor"
                                onClick={() => {
                                  setEditingId(
                                    editingId === response.id ? null : response.id,
                                  );
                                  setEditPrice(String(response.unitPrice));
                                }}
                              >
                                <Pencil
                                  className={`h-4 w-4 ${outlier ? "text-amber-600" : ""}`}
                                />
                              </Button>
                            )}
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

                        {editingId === response.id && (
                          <PriceCorrection
                            unit={current.unit}
                            quantity={current.quantity}
                            value={editPrice}
                            onChange={setEditPrice}
                            saving={updateResponse.isPending}
                            onCancel={() => setEditingId(null)}
                            onSave={() => handleCorrectPrice(response)}
                          />
                        )}

                        {isExpanded && <ResponseDetails response={response} />}
                      </div>
                    );
                  })}
                </div>
              )}

              {committedList.length > 0 && (
                <div
                  className={`mt-3 rounded-lg border ${
                    belowMinimum.length > 0 ? "border-amber-300 bg-amber-50/60" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPanelOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 p-3 text-left"
                  >
                    <span className="text-xs font-medium">
                      Fechado até agora · {committedList.length}{" "}
                      {committedList.length === 1 ? "fornecedor" : "fornecedores"} ·{" "}
                      {formatCurrency(committedList.reduce((s, c) => s + c.total, 0))}
                      {belowMinimum.length > 0 && (
                        <span className="ml-1 text-amber-800">
                          · {belowMinimum.length} abaixo do mínimo
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        panelOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {panelOpen && (
                    <div className="space-y-1.5 border-t px-3 py-2">
                      {committedList.map((s) => {
                        const below = s.minimum > 0 && s.total < s.minimum;
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="min-w-0 truncate">
                              {s.name}{" "}
                              <span className="text-muted-foreground">
                                ({s.items} {s.items === 1 ? "item" : "itens"})
                              </span>
                            </span>
                            <span
                              className={`shrink-0 ${below ? "font-medium text-amber-800" : ""}`}
                            >
                              {formatCurrency(s.total)}
                              {s.minimum > 0 &&
                                (below
                                  ? ` · faltam ${formatCurrency(s.minimum - s.total)}`
                                  : " · mínimo ok")}
                            </span>
                          </div>
                        );
                      })}
                      {belowMinimum.length > 0 && (
                        <p className="pt-1 text-[11px] text-amber-700">
                          Some mais itens desses fornecedores ou escolha outro · eles
                          podem recusar a entrega.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {current.unavailable.length > 0 && (
                <div className="mt-3 rounded-lg border border-dashed p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Não têm este item
                  </p>
                  {current.unavailable.map((u) => (
                    <p key={u.id} className="text-xs text-muted-foreground">
                      <strong className="text-foreground">{u.supplierName}</strong> ·{" "}
                      {UNAVAILABLE_LABELS[u.reason] ?? "não pode ofertar"}
                      {u.notes ? ` · ${u.notes}` : ""}
                    </p>
                  ))}
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
