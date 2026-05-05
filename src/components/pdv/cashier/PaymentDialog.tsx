import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Banknote,
  CreditCard,
  QrCode,
  Receipt,
  CheckCircle,
  Loader2,
  Percent,
  DollarSign,
  Plus,
  X,
  Sparkles,
  Lock,
  FileText,
  Printer,
  AlertTriangle,
  Trash2,
  Search,
  Lock as LockIcon,
  Minus,
  Check,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Comanda, ComandaItem, usePDVComandas } from "@/hooks/use-pdv-comandas";
import { PDVTable } from "@/hooks/use-pdv-tables";
import { usePDVPayments, PaymentMethod } from "@/hooks/use-pdv-payments";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { useNFCeEmission } from "@/hooks/use-nfce-emission";
import { usePDVSettings } from "@/hooks/use-pdv-settings";
import { printNonFiscalReceipt, printDanfeFromUrl } from "@/lib/print-fiscal-receipt";
import { formatTableLabel } from "@/utils/formatTableNumber";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comanda?: Comanda | null;
  items?: ComandaItem[];
  table?: PDVTable | null;
  tableComandas?: Comanda[];
  tableItems?: ComandaItem[];
  /** Quando true, força split com 1 linha por comanda nominal (cobrar tudo da mesa) */
  splitByComanda?: boolean;
  onSuccess?: () => void;
  /** Saldo atual da gaveta — usado para validar troco em dinheiro */
  drawerBalance?: number;
}

type CardType = "credito" | "debito";
type DiscountType = "percent" | "value";

interface SplitPayment {
  id: string;
  method: PaymentMethod;
  cardType?: CardType;
  amount: string;
  installments: string;
  /** Quando preenchido, esta linha cobra uma comanda nominal específica */
  comandaId?: string;
  comandaLabel?: string;
}

const paymentMethods = [
  { id: "dinheiro" as PaymentMethod, label: "Dinheiro", icon: Banknote, color: "text-green-600" },
  { id: "cartao" as PaymentMethod, label: "Cartão", icon: CreditCard, color: "text-blue-600" },
  { id: "pix" as PaymentMethod, label: "PIX", icon: QrCode, color: "text-purple-600" },
  { id: "vale_refeicao" as PaymentMethod, label: "VR / VA", icon: Ticket, color: "text-orange-600" },
];

const quickValues = [50, 100, 150, 200];

export function PaymentDialog({
  open,
  onOpenChange,
  comanda,
  items = [],
  table,
  tableComandas = [],
  tableItems = [],
  splitByComanda = false,
  onSuccess,
  drawerBalance = 0,
}: PaymentDialogProps) {
  const { user } = useAuth();
  
  // Payment state
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("dinheiro");
  const [cardType, setCardType] = useState<CardType>("credito");
  const [cashReceived, setCashReceived] = useState("");
  const [installments, setInstallments] = useState("1");
  
  // Discount & fees — fluxo guiado em 4 etapas
  type DiscountStage = "idle" | "typing" | "confirming" | "applied";
  const [discountStage, setDiscountStage] = useState<DiscountStage>("idle");
  const [discountTypeChosen, setDiscountTypeChosen] = useState<DiscountType | null>(null);
  // Mantemos `discountType` legado como espelho para evitar undefined em handlers existentes
  const discountType: DiscountType = discountTypeChosen ?? "percent";
  const [discountValue, setDiscountValue] = useState("");
  const [discountPassword, setDiscountPassword] = useState("");
  const [discountAuthorized, setDiscountAuthorized] = useState(false);
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountTypeChangedWarning, setDiscountTypeChangedWarning] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<{
    type: DiscountType;
    rawValue: string;
    amount: number;
    percent: number;
    reason?: string;
    authorizedBy?: string;
  } | null>(null);
  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(true);
  // Settings carregam um pouco depois do mount; quando vierem com taxa
  // desativada, sincronizamos o estado local para refletir a configuração.
  
  // Split payment
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([]);

  // Charge mode (segmented): "all" | "split-forms" | "by-product"
  type ChargeMode = "all" | "split-forms" | "by-product";
  const [chargeMode, setChargeMode] = useState<ChargeMode>("all");
  // Map<itemId, qtyToPay>
  const [selectedItemQtys, setSelectedItemQtys] = useState<Map<string, number>>(new Map());
  // Sessão de cobrança "Por produto" — usada para lock/unlock de itens
  const chargingSessionRef = useRef<string>("");
  
  // Success state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ change: number } | null>(null);
  const [nfceState, setNfceState] = useState<
    | { kind: "idle" }
    | { kind: "success"; chave: string; danfe?: string }
    | { kind: "error"; message: string; missing?: string[] }
  >({ kind: "idle" });

  const { registerPayment, isRegisteringPayment, registerTablePayment, isRegisteringTablePayment, registerPartialPayment, isRegisteringPartialPayment } = usePDVPayments();
  const {
    markAsCharging,
    releaseFromCharging,
    removeItem,
    isRemovingItem,
    addItem,
    isAddingItem,
    comandaItems: liveComandaItems,
    lockItemsForCharging,
    unlockItemsForCharging,
  } = usePDVComandas();
  const { products: productsList } = usePDVProducts();
  const { emitNFCe, isEmitting } = useNFCeEmission();
  const { settings } = usePDVSettings();

  // Configuração global da taxa de serviço (vem das pdv_settings)
  const serviceFeeAllowed = settings?.enable_service_fee ?? true;
  const serviceFeePercentage = Number(settings?.service_fee_percentage ?? 10);
  const serviceFeeRate = serviceFeePercentage / 100;

  // Quando o estabelecimento desativa a taxa, força o switch local em off.
  useEffect(() => {
    if (!serviceFeeAllowed) setServiceFeeEnabled(false);
  }, [serviceFeeAllowed]);

  // Edição do pedido (correção pelo caixa)
  const [itemToRemove, setItemToRemove] = useState<ComandaItem | null>(null);
  // IDs removidos otimisticamente — garante que o item suma do Resumo
  // imediatamente, mesmo no fallback de Balcão (props snapshot).
  const [optimisticallyRemoved, setOptimisticallyRemoved] = useState<Set<string>>(new Set());
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [addItemQty, setAddItemQty] = useState("1");
  const [addItemNotes, setAddItemNotes] = useState("");

  // Limpa o set de remoções otimistas quando o dialog fecha,
  // evitando vazamento entre aberturas consecutivas.
  useEffect(() => {
    if (!open) setOptimisticallyRemoved(new Set());
  }, [open]);

  // Comandas envolvidas neste pagamento (1 ou várias)
  const involvedComandas: Comanda[] = table
    ? tableComandas
    : comanda
      ? [comanda]
      : [];

  // Travamos `em_cobranca` quando o dialog abre. Guardamos os IDs
  // efetivamente travados (por nós) para liberar caso o operador cancele.
  const lockedIdsRef = useRef<string[]>([]);
  const paymentDoneRef = useRef(false);

  // Determine payment context
  const isTablePayment = !!table;

  // Itens vivos via React Query (atualizam em tempo real após add/remove)
  const liveItemsForPayment: ComandaItem[] = isTablePayment
    ? liveComandaItems.filter((it) => tableComandas.some((c) => c.id === it.comanda_id))
    : comanda
      ? liveComandaItems.filter((it) => it.comanda_id === comanda.id)
      : [];

  // Fallback para Balcão (comanda virtual sem registro real em pdv_comandas)
  const rawDisplayItems: ComandaItem[] = liveItemsForPayment.length > 0
    ? liveItemsForPayment
    : (isTablePayment ? tableItems : items);
  const displayItems: ComandaItem[] = rawDisplayItems.filter(
    (it) => !optimisticallyRemoved.has(it.id),
  );

  const liveSubtotal = displayItems.reduce(
    (sum, it) => sum + Number(it.subtotal || 0),
    0,
  );
  const fullSubtotal = liveItemsForPayment.length > 0
    ? liveSubtotal
    : (isTablePayment
        ? tableComandas.reduce((sum, c) => sum + c.subtotal, 0)
        : (comanda?.subtotal || 0));

  // Pagamento parcial (modo by-product) é suportado apenas quando temos itens reais persistidos.
  const supportsByProduct = liveItemsForPayment.length > 0 && !isTablePayment;

  // Itens disponíveis para seleção parcial (apenas com quantidade pendente)
  const selectableItems = displayItems.filter((it) => {
    const paid = (it as any).paid_quantity || 0;
    return it.quantity - paid > 0;
  });

  // Subtotal pendente (todos itens não pagos)
  const pendingSubtotal = selectableItems.reduce((sum, it) => {
    const paid = (it as any).paid_quantity || 0;
    return sum + (it.quantity - paid) * Number(it.unit_price || 0);
  }, 0);

  // Subtotal selecionado (modo by-product)
  const selectedSubtotal = Array.from(selectedItemQtys.entries()).reduce((sum, [id, qty]) => {
    const it = displayItems.find((d) => d.id === id);
    if (!it) return sum;
    return sum + qty * Number(it.unit_price || 0);
  }, 0);

  const isByProduct = chargeMode === "by-product" && supportsByProduct;

  // Subtotal efetivo usado para descontos/taxas/total
  const subtotal = isByProduct ? selectedSubtotal : fullSubtotal;

  const title = isTablePayment
    ? formatTableLabel(table?.table_number)
    : `Comanda #${comanda?.comanda_number}`;

  // Calculate discount — só conta no total quando confirmado/aplicado
  // Durante "typing"/"confirming" o operador ainda não decidiu, então o total fica intacto
  const discountAmount = appliedDiscount?.amount ?? 0;

  // Valor calculado do desconto a partir do que está digitado (independe do stage).
  // Necessário porque o operador clica "Confirmar" quando o stage já mudou para "confirming".
  const computedDiscountAmount = (() => {
    const v = parseFloat(discountValue) || 0;
    if (v <= 0) return 0;
    return discountTypeChosen === "percent" ? (subtotal * v) / 100 : v;
  })();
  // Preview enquanto digita (não afeta o total mostrado)
  const previewAmount = discountStage === "typing" ? computedDiscountAmount : 0;
  const previewPercent = subtotal > 0 ? (previewAmount / subtotal) * 100 : 0;
  const previewExceedsSubtotal = computedDiscountAmount > subtotal && subtotal > 0;

  // Calculate service fee (10%)
  const serviceFeeAmount = serviceFeeEnabled && serviceFeeAllowed ? (subtotal - discountAmount) * serviceFeeRate : 0;

  // Final total
  const total = Math.max(0, subtotal - discountAmount + serviceFeeAmount);

  // Cash calculations
  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const changeAmount = selectedMethod === "dinheiro" ? Math.max(0, cashReceivedNum - total) : 0;

  // Split payment total
  const splitTotal = splitPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const splitRemaining = total - splitTotal;

  // Discount: dependendo da configuração, motivo pode ou não ser obrigatório
  const requireReason = !!settings?.require_discount_reason;
  const hasDiscount = !!appliedDiscount;

  // Bloqueia finalização enquanto o operador estiver mexendo num desconto sem confirmar
  const discountInProgress = discountStage === "typing" || discountStage === "confirming";

  // Validation
  const hasByProductSelection = isByProduct && selectedItemQtys.size > 0 && selectedSubtotal > 0;
  const byProductBlocks = chargeMode === "by-product" && (!supportsByProduct || !hasByProductSelection);
  const canSubmit = !discountInProgress && !byProductBlocks && (splitEnabled
    ? Math.abs(splitRemaining) < 0.01 && splitPayments.length > 0
    : selectedMethod !== "dinheiro" || cashReceivedNum >= total);

  // Reset state + adquirir lock em_cobranca quando o dialog abre.
  useEffect(() => {
    if (open) {
      setSelectedMethod("dinheiro");
      setCardType("credito");
      setCashReceived("");
      setInstallments("1");
      setDiscountStage("idle");
      setDiscountTypeChosen(null);
      setDiscountValue("");
      setDiscountPassword("");
      setDiscountAuthorized(false);
      setDiscountAuthorizedBy("");
      setDiscountReason("");
      setDiscountTypeChangedWarning(false);
      setAppliedDiscount(null);
      setServiceFeeEnabled(true);
      setShowSuccess(false);
      setSuccessData(null);
      setNfceState({ kind: "idle" });
      paymentDoneRef.current = false;
      lockedIdsRef.current = [];
      setChargeMode(splitByComanda && tableComandas.length > 1 ? "split-forms" : "all");
      setSelectedItemQtys(new Map());
      chargingSessionRef.current = crypto.randomUUID();

      // Pré-popular split-por-comanda quando vier de "Cobrar tudo da mesa"
      if (splitByComanda && tableComandas.length > 1) {
        setSplitEnabled(true);
        setSplitPayments(
          tableComandas.map((c) => ({
            id: crypto.randomUUID(),
            method: "dinheiro" as PaymentMethod,
            amount: c.subtotal.toFixed(2),
            installments: "1",
            comandaId: c.id,
            comandaLabel: c.customer_name ?? `#${c.comanda_number}`,
          })),
        );
      } else {
        setSplitEnabled(false);
        setSplitPayments([]);
      }

      // Adquire lock em_cobranca para comandas vindas do garçom (aberta ou aguardando_pagamento)
      const candidateIds = involvedComandas
        .filter((c) => c.status === "aberta" || c.status === "aguardando_pagamento")
        .map((c) => c.id);
      if (candidateIds.length > 0) {
        markAsCharging(candidateIds)
          .then((lockedIds) => {
            lockedIdsRef.current = lockedIds;
            // Se algum candidato não pôde ser travado (outro caixa pegou antes),
            // fechamos o dialog para evitar conflito.
            if (lockedIds.length < candidateIds.length) {
              const stolen = candidateIds.length - lockedIds.length;
              toast.error(
                stolen === candidateIds.length
                  ? "Outro operador já está cobrando esta(s) comanda(s)."
                  : `${stolen} comanda(s) já está(ão) sendo cobrada(s) por outro operador.`,
              );
              if (lockedIds.length === 0) {
                onOpenChange(false);
              }
            }
          })
          .catch(() => {
            // Erro de rede: não bloqueia o pagamento (mutation final usa filtro tolerante).
          });
      }
    } else {
      // Dialog fechando: liberar lock se o pagamento não foi concluído
      if (!paymentDoneRef.current && lockedIdsRef.current.length > 0) {
        releaseFromCharging(lockedIdsRef.current).catch(() => {});
        lockedIdsRef.current = [];
      }
      // Liberar locks de itens em modo by-product
      if (!paymentDoneRef.current && chargingSessionRef.current && selectedItemQtys.size > 0) {
        const itemIds = Array.from(selectedItemQtys.keys());
        unlockItemsForCharging({ itemIds, sessionId: chargingSessionRef.current }).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleQuickValue = (value: number) => {
    setCashReceived(value.toString());
  };

  const handleExactValue = () => {
    setCashReceived(total.toString());
  };

  const addSplitPayment = () => {
    const allocated = splitPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const remaining = total - allocated;
    setSplitPayments([
      ...splitPayments,
      {
        id: crypto.randomUUID(),
        method: "dinheiro",
        amount: remaining > 0 ? remaining.toFixed(2) : "",
        installments: "1",
      },
    ]);
  };

  const removeSplitPayment = (id: string) => {
    setSplitPayments(splitPayments.filter((p) => p.id !== id));
  };

  const updateSplitPayment = (id: string, updates: Partial<SplitPayment>) => {
    setSplitPayments(
      splitPayments.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  // ===== Modo "Por produto" — helpers =====
  const remainingQty = (it: ComandaItem) => it.quantity - ((it as any).paid_quantity || 0);

  const isItemLockedByOther = (it: ComandaItem) => {
    const sid = (it as any).charging_session_id as string | null | undefined;
    return !!sid && sid !== chargingSessionRef.current;
  };

  const tryLockItem = async (itemId: string): Promise<boolean> => {
    try {
      const locked = await lockItemsForCharging({
        itemIds: [itemId],
        sessionId: chargingSessionRef.current,
      });
      if (!locked.includes(itemId)) {
        toast.error("Este item já está sendo cobrado por outro operador.");
        return false;
      }
      return true;
    } catch (e) {
      toast.error("Não foi possível travar o item.");
      return false;
    }
  };

  const toggleItemSelection = async (it: ComandaItem) => {
    const next = new Map(selectedItemQtys);
    if (next.has(it.id)) {
      next.delete(it.id);
      setSelectedItemQtys(next);
      // Libera lock
      unlockItemsForCharging({
        itemIds: [it.id],
        sessionId: chargingSessionRef.current,
      }).catch(() => {});
    } else {
      const ok = await tryLockItem(it.id);
      if (!ok) return;
      next.set(it.id, remainingQty(it));
      setSelectedItemQtys(next);
    }
  };

  const setItemQty = (itemId: string, qty: number) => {
    const it = displayItems.find((d) => d.id === itemId);
    if (!it) return;
    const max = remainingQty(it);
    const clamped = Math.max(1, Math.min(max, qty));
    const next = new Map(selectedItemQtys);
    next.set(itemId, clamped);
    setSelectedItemQtys(next);
  };

  const selectAllPending = async () => {
    const candidates = selectableItems.filter((it) => !isItemLockedByOther(it) && !selectedItemQtys.has(it.id));
    if (!candidates.length) return;
    try {
      const locked = await lockItemsForCharging({
        itemIds: candidates.map((c) => c.id),
        sessionId: chargingSessionRef.current,
      });
      const next = new Map(selectedItemQtys);
      candidates.forEach((it) => {
        if (locked.includes(it.id)) next.set(it.id, remainingQty(it));
      });
      setSelectedItemQtys(next);
      if (locked.length < candidates.length) {
        toast.info("Alguns itens já estão sendo cobrados por outro operador.");
      }
    } catch {
      toast.error("Erro ao selecionar itens.");
    }
  };

  const clearSelection = () => {
    if (selectedItemQtys.size === 0) return;
    const itemIds = Array.from(selectedItemQtys.keys());
    unlockItemsForCharging({ itemIds, sessionId: chargingSessionRef.current }).catch(() => {});
    setSelectedItemQtys(new Map());
  };

  const handleSubmit = async () => {
    if (isProcessing) return;
    try {
      const finalAmount = total;
      // Mapeia "cartao" + cardType para credito/debito (granularidade exigida pela conferência do fechamento)
      const resolvedMethod: PaymentMethod =
        selectedMethod === "cartao"
          ? (cardType === "debito" ? "debito" : "credito")
          : selectedMethod;

      const paymentData = {
        amount: finalAmount,
        paymentMethod: resolvedMethod,
        cashReceived: selectedMethod === "dinheiro" ? cashReceivedNum : undefined,
        changeAmount: selectedMethod === "dinheiro" ? changeAmount : undefined,
        installments: resolvedMethod === "credito" ? parseInt(installments) : undefined,
        discountAmount: appliedDiscount ? appliedDiscount.amount : undefined,
        discountReason: appliedDiscount ? appliedDiscount.reason : undefined,
        discountAuthorizedBy: appliedDiscount ? appliedDiscount.authorizedBy : undefined,
      };

      // Modo "Por produto": pagamento parcial dos itens selecionados
      if (isByProduct && comanda) {
        const partialItems = Array.from(selectedItemQtys.entries()).map(([id, qty]) => {
          const it = displayItems.find((d) => d.id === id)!;
          return { itemId: id, quantityPaid: qty, unitPrice: Number(it.unit_price || 0) };
        });
        await registerPartialPayment({
          comandaId: comanda.id,
          orderId: comanda.order_id,
          ...paymentData,
          partialItems,
          chargingSessionId: chargingSessionRef.current,
        });
      } else {
        // Modo split-por-comanda: 1 pagamento por comanda nominal (cada um com seu método)
        const isSplitByComanda = splitEnabled && splitPayments.some((p) => p.comandaId);
        if (isSplitByComanda && isTablePayment) {
          for (const line of splitPayments) {
            if (!line.comandaId) continue;
            const c = tableComandas.find((x) => x.id === line.comandaId);
            if (!c) continue;
            const lineMethod: PaymentMethod =
              line.method === "cartao"
                ? (line.cardType === "debito" ? "debito" : "credito")
                : line.method;
            await registerPayment({
              comandaId: c.id,
              orderId: c.order_id,
              amount: parseFloat(line.amount) || c.subtotal,
              paymentMethod: lineMethod,
              installments: lineMethod === "credito" ? parseInt(line.installments) : undefined,
              cashReceived: lineMethod === "dinheiro" ? parseFloat(line.amount) : undefined,
            });
          }
        } else if (isTablePayment && table) {
          await registerTablePayment({
            tableId: table.id,
            comandaIds: tableComandas.map((c) => c.id),
            ...paymentData,
          });
        } else if (comanda) {
          await registerPayment({
            comandaId: comanda.id,
            orderId: comanda.order_id,
            ...paymentData,
          });
        }
      }

      paymentDoneRef.current = true;
      setSuccessData({ change: changeAmount });
      setShowSuccess(true);
    } catch (error) {
      console.error("Erro ao processar pagamento:", error);
    }
  };

  const handleFinish = () => {
    onOpenChange(false);
    onSuccess?.();
  };

  const buildBusinessInfo = () => ({
    name: settings?.business_name || settings?.nfe_nome_fantasia || "Estabelecimento",
    cnpj: settings?.business_cnpj || "",
    address: settings?.business_address || "",
    phone: settings?.business_phone || "",
  });

  const handlePrintNonFiscal = () => {
    const mesaRaw = isTablePayment
      ? String(table?.table_number ?? "")
      : "";
    const mesaLabel = mesaRaw
      ? (/^mesa\b/i.test(mesaRaw) ? mesaRaw : `MESA ${mesaRaw}`)
      : "BALCÃO";
    const comandaLabel = isTablePayment
      ? (tableComandas.length > 1
          ? `${tableComandas.length} comandas`
          : (tableComandas[0]?.customer_name
              || (tableComandas[0]?.comanda_number
                  ? `Comanda #${tableComandas[0].comanda_number}`
                  : "")))
      : (comanda?.customer_name
          || (comanda?.comanda_number ? `Comanda #${comanda.comanda_number}` : ""));

    printNonFiscalReceipt({
      business: buildBusinessInfo(),
      header: { mesa: mesaLabel, comanda: comandaLabel },
      items: displayItems.map((i) => ({
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
      })),
      subtotal,
      desconto: discountAmount,
      taxa_servico: serviceFeeAmount,
      total,
      forma_pagamento: selectedMethod,
      valor_pago: selectedMethod === "dinheiro" ? cashReceivedNum : total,
      troco: changeAmount,
    });
  };

  const handleEmitNFCe = async () => {
    try {
      // Buscar dados fiscais dos produtos
      const productIds = Array.from(new Set(displayItems.map((i) => i.product_id).filter(Boolean)));
      let productMap: Record<string, any> = {};
      if (productIds.length) {
        const { data: prods } = await supabase
          .from("pdv_products")
          .select("id, ncm, cfop, cest, origem, ean, unit")
          .in("id", productIds as string[]);
        (prods || []).forEach((p: any) => { productMap[p.id] = p; });
      }

      const result = await emitNFCe({
        comanda_id: comanda?.id || null,
        table_id: table?.id || null,
        order_id: comanda?.order_id || null,
        cashier_session_id: null,
        items: displayItems.map((i) => {
          const p = productMap[i.product_id] || {};
          return {
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            subtotal: i.subtotal,
            ncm: p.ncm,
            cfop: p.cfop,
            cest: p.cest,
            origem: p.origem,
            ean: p.ean,
            unidade: p.unit,
          };
        }),
        valor_desconto: discountAmount || 0,
        valor_servico: serviceFeeAmount || 0,
        forma_pagamento: selectedMethod === "cartao" ? (cardType === "credito" ? "cartao_credito" : "cartao_debito") : selectedMethod,
        valor_pago: selectedMethod === "dinheiro" ? cashReceivedNum : total,
        troco: changeAmount || 0,
        parcelas: selectedMethod === "cartao" ? parseInt(installments) : 1,
      });

      if (result.success && result.chave_acesso) {
        setNfceState({ kind: "success", chave: result.chave_acesso, danfe: result.danfe_url });
      } else {
        setNfceState({
          kind: "error",
          message: result.motivo || result.error || "Falha ao emitir",
          missing: result.missing,
        });
      }
    } catch (e: any) {
      setNfceState({ kind: "error", message: e.message || "Erro inesperado" });
    }
  };

  const isProcessing = isRegisteringPayment || isRegisteringTablePayment || isRegisteringPartialPayment;

  if (showSuccess) {
    const nfceEnabled = !!settings?.nfe_enable_nfce;
    const nfceConfigured = nfceEnabled && !!settings?.nfe_certificate_url && !!settings?.nfe_csc_id && !!settings?.nfe_csc_token;
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleFinish(); }}>
        <DialogContent className="sm:max-w-md">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center py-6 space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-xl font-bold text-green-600">Pagamento Confirmado!</h3>
              <p className="text-2xl font-bold">{formatCurrency(total)}</p>
              {successData && successData.change > 0 && (
                <p className="text-sm text-muted-foreground">
                  Troco: <span className="font-bold text-foreground">{formatCurrency(successData.change)}</span>
                </p>
              )}
            </div>

            {/* NFC-e status */}
            {nfceState.kind === "success" && (
              <div className="w-full rounded-md border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-900 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  NFC-e autorizada
                </div>
                <p className="text-[11px] font-mono break-all text-muted-foreground">{nfceState.chave}</p>
                {nfceState.danfe && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => printDanfeFromUrl(nfceState.danfe!)}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir DANFE NFC-e
                  </Button>
                )}
              </div>
            )}

            {nfceState.kind === "error" && (
              <div className="w-full rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900 p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  NFC-e não emitida
                </div>
                <p className="text-xs text-muted-foreground">{nfceState.message}</p>
                {nfceState.missing?.length ? (
                  <ul className="text-xs text-muted-foreground list-disc list-inside">
                    {nfceState.missing.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                ) : null}
              </div>
            )}

            <div className="w-full space-y-2 pt-2">
              <Button
                className="w-full"
                size="lg"
                onClick={handleEmitNFCe}
                disabled={isEmitting || nfceState.kind === "success" || !nfceConfigured}
                title={!nfceConfigured ? "Configure NFC-e em Integrações > NF Automática" : undefined}
              >
                {isEmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                {nfceState.kind === "error" ? "Tentar emitir NFC-e novamente" : "Emitir NFC-e (Cupom Fiscal)"}
              </Button>

              {!nfceConfigured && (
                <p className="text-[11px] text-center text-muted-foreground -mt-1">
                  {!nfceEnabled ? "NFC-e desabilitada nas configurações" : "Configure certificado e CSC em Integrações > NF Automática"}
                </p>
              )}

              <Button variant="outline" className="w-full" onClick={handlePrintNonFiscal}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Recibo Não-Fiscal
              </Button>

              <Button variant="ghost" className="w-full" onClick={handleFinish}>
                Concluir
              </Button>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    );
  }

  // Produtos para o dialog de adicionar item
  const targetComandaIdForAdd: string | null =
    comanda?.id ?? (isTablePayment && tableComandas.length === 1 ? tableComandas[0].id : null);
  const filteredProducts = (productsList || []).filter((p: any) => {
    if (!p.is_available) return false;
    if (!productSearch.trim()) return true;
    const q = productSearch.trim().toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.ean?.toLowerCase?.().includes(q) ||
      p.category?.toLowerCase?.().includes(q)
    );
  });
  const selectedProduct = filteredProducts.find((p: any) => p.id === selectedProductId)
    ?? (productsList || []).find((p: any) => p.id === selectedProductId);

  const handleConfirmAddItem = async () => {
    if (!targetComandaIdForAdd || !selectedProduct) return;
    const qty = Math.max(1, parseInt(addItemQty) || 1);
    try {
      await addItem({
        comandaId: targetComandaIdForAdd,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity: qty,
        unitPrice: Number(selectedProduct.price_salon) || 0,
        notes: addItemNotes.trim() || undefined,
      });
      setAddItemDialogOpen(false);
      setSelectedProductId(null);
      setProductSearch("");
      setAddItemQty("1");
      setAddItemNotes("");
    } catch (e) {
      // toast já é exibido pelo hook
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Pagamento - {title}
          </DialogTitle>
          <DialogDescription>
            Revise o pedido e selecione a forma de pagamento
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Column - Order Summary */}
          <div className="flex flex-col gap-4 max-h-[65vh]">
            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            {/* Items List */}
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Resumo do Pedido
                </h4>
                <ScrollArea className={cn(isByProduct ? "h-[260px]" : "h-[160px]")}>
                  <div className="space-y-1">
                    <AnimatePresence initial={false}>
                      {displayItems.map((item) => {
                        const canRemove =
                          item.kitchen_status === "pendente" ||
                          item.kitchen_status === "preparando";
                        const paid = (item as any).paid_quantity || 0;
                        const remaining = item.quantity - paid;
                        const fullyPaid = remaining <= 0;
                        const lockedByOther = isItemLockedByOther(item);
                        const selectedQty = selectedItemQtys.get(item.id) || 0;
                        const isSelected = selectedQty > 0;
                        return (
                          <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            transition={{ duration: 0.2 }}
                            className={cn(
                              "flex items-center justify-between gap-2 text-sm py-1",
                              isByProduct && isSelected && "bg-primary/5 rounded-md px-1",
                              fullyPaid && "opacity-50",
                            )}
                          >
                            {isByProduct && (
                              <div className="shrink-0">
                                {fullyPaid ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : lockedByOther ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <LockIcon className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right">Em cobrança por outro operador</TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleItemSelection(item)}
                                    aria-label={`Selecionar ${item.product_name}`}
                                    className="h-5 w-5"
                                  />
                                )}
                              </div>
                            )}
                            <span className={cn(
                              "text-muted-foreground flex-1 min-w-0 truncate",
                              fullyPaid && "line-through",
                            )}>
                              {item.quantity}x {item.product_name}
                              {paid > 0 && !fullyPaid && (
                                <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1">{paid}/{item.quantity} pago</Badge>
                              )}
                              {fullyPaid && (
                                <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1 border-green-600 text-green-700">pago</Badge>
                              )}
                            </span>
                            {isByProduct && isSelected && remaining > 1 && (
                              <div className="flex items-center gap-1 shrink-0">
                                <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                                  onClick={() => setItemQty(item.id, selectedQty - 1)} disabled={selectedQty <= 1}>
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-xs font-medium tabular-nums w-10 text-center">{selectedQty}/{remaining}</span>
                                <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                                  onClick={() => setItemQty(item.id, selectedQty + 1)} disabled={selectedQty >= remaining}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                            <span className="font-medium tabular-nums shrink-0">
                              {formatCurrency(isByProduct && isSelected ? selectedQty * Number(item.unit_price || 0) : item.subtotal)}
                            </span>
                            {!isByProduct && (canRemove ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setItemToRemove(item)}
                                disabled={isRemovingItem}
                                aria-label="Remover item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 text-muted-foreground/40 cursor-not-allowed"
                                      disabled
                                      aria-label="Item não pode ser removido"
                                      tabIndex={-1}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left">Item já preparado pela cozinha — não pode ser removido</TooltipContent>
                              </Tooltip>
                            ))}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </ScrollArea>

                {/* Add item / multi-comanda hint */}
                <div className="mt-3 pt-3 border-t">
                  {isTablePayment && tableComandas.length > 1 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Para adicionar itens, acesse a comanda específica.
                    </p>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setProductSearch("");
                        setSelectedProductId(null);
                        setAddItemQty("1");
                        setAddItemNotes("");
                        setAddItemDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar item
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Discount & Service Fee */}
            <Card>
              <CardContent className="p-4 space-y-4">
                {/* Discount — fluxo guiado em 4 etapas */}
                <div className="space-y-3">
                  <Label className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Desconto
                  </Label>

                  {/* === ETAPA: applied — resumo fixo === */}
                  {discountStage === "applied" && appliedDiscount && (
                    <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium">
                          Desconto aplicado: -{formatCurrency(appliedDiscount.amount)}{" "}
                          <span className="text-muted-foreground">
                            ({appliedDiscount.type === "percent"
                              ? `${appliedDiscount.rawValue}%`
                              : `${appliedDiscount.percent.toFixed(1).replace(".", ",")}%`})
                          </span>
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setAppliedDiscount(null);
                          setDiscountStage("idle");
                          setDiscountTypeChosen(null);
                          setDiscountValue("");
                          setDiscountPassword("");
                          setDiscountAuthorized(false);
                          setDiscountAuthorizedBy("");
                          setDiscountReason("");
                          setDiscountTypeChangedWarning(false);
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  )}

                  {/* === ETAPA: idle / typing — escolha de tipo + campo === */}
                  {(discountStage === "idle" || discountStage === "typing") && (
                    <>
                      {/* Botões grandes de tipo */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={discountTypeChosen === "percent" ? "default" : "outline"}
                          className="h-12 justify-center gap-2"
                          onClick={() => {
                            const switching = discountTypeChosen && discountTypeChosen !== "percent" && discountValue;
                            setDiscountTypeChosen("percent");
                            if (switching) {
                              setDiscountValue("");
                              setDiscountTypeChangedWarning(true);
                            } else {
                              setDiscountTypeChangedWarning(false);
                            }
                            if (discountStage === "idle") setDiscountStage("typing");
                          }}
                        >
                          <Percent className="h-4 w-4" />
                          <span className="font-medium">Desconto em %</span>
                        </Button>
                        <Button
                          type="button"
                          variant={discountTypeChosen === "value" ? "default" : "outline"}
                          className="h-12 justify-center gap-2"
                          onClick={() => {
                            const switching = discountTypeChosen && discountTypeChosen !== "value" && discountValue;
                            setDiscountTypeChosen("value");
                            if (switching) {
                              setDiscountValue("");
                              setDiscountTypeChangedWarning(true);
                            } else {
                              setDiscountTypeChangedWarning(false);
                            }
                            if (discountStage === "idle") setDiscountStage("typing");
                          }}
                        >
                          <DollarSign className="h-4 w-4" />
                          <span className="font-medium">Desconto em R$</span>
                        </Button>
                      </div>

                      {/* Campo de valor */}
                      {discountTypeChosen === "percent" ? (
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            placeholder={discountStage === "idle" ? "Selecione o tipo primeiro" : "0"}
                            value={discountValue}
                            disabled={discountStage === "idle"}
                            onChange={(e) => {
                              const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                              setDiscountValue(val > 0 ? val.toString() : e.target.value);
                              setDiscountTypeChangedWarning(false);
                            }}
                            className={cn(
                              "pr-8 h-11",
                              previewExceedsSubtotal && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">%</span>
                        </div>
                      ) : discountTypeChosen === "value" ? (
                        <div className="relative">
                          <CurrencyInput
                            value={discountValue}
                            onChange={(val) => {
                              setDiscountValue(val);
                              setDiscountTypeChangedWarning(false);
                            }}
                            placeholder="0,00"
                            className={cn(
                              "h-11",
                              previewExceedsSubtotal && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        </div>
                      ) : (
                        <Input
                          placeholder="Selecione o tipo primeiro"
                          disabled
                          className="h-11 bg-muted/40"
                        />
                      )}

                      {/* Aviso de troca de tipo */}
                      {discountTypeChangedWarning && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Tipo alterado — revise o valor
                        </p>
                      )}

                      {/* Preview / erro */}
                      {discountStage === "typing" && discountValue && parseFloat(discountValue) > 0 && (
                        previewExceedsSubtotal ? (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Desconto maior que o valor da conta
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {discountTypeChosen === "percent" ? (
                              <>
                                <span className="font-semibold text-foreground">
                                  {discountValue}% = {formatCurrency(previewAmount)}
                                </span>{" "}
                                será descontado do subtotal de {formatCurrency(subtotal)}
                              </>
                            ) : (
                              <>
                                <span className="font-semibold text-foreground">
                                  {formatCurrency(previewAmount)} = {previewPercent.toFixed(1).replace(".", ",")}%
                                </span>{" "}
                                será descontado do subtotal de {formatCurrency(subtotal)}
                              </>
                            )}
                          </p>
                        )
                      )}

                      {/* Botão Aplicar desconto (separado do botão Cobrar) */}
                      {discountStage === "typing" && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          disabled={
                            !discountValue ||
                            parseFloat(discountValue) <= 0 ||
                            previewExceedsSubtotal
                          }
                          onClick={() => setDiscountStage("confirming")}
                        >
                          Aplicar desconto
                        </Button>
                      )}
                    </>
                  )}

                  {/* === ETAPA: confirming — resumo + senha + (motivo se exigido) === */}
                  {discountStage === "confirming" && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900 p-3 space-y-3">
                      <div className="text-sm font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        Confirmar desconto
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">Tipo:</span>
                        <span className="text-right font-medium">
                          {discountTypeChosen === "percent" ? "Percentual" : "Valor fixo"}
                        </span>

                        <span className="text-muted-foreground">Valor:</span>
                        <span className="text-right font-medium">
                          {discountTypeChosen === "percent"
                            ? `${discountValue}%`
                            : formatCurrency(parseFloat(discountValue) || 0)}
                        </span>

                        <span className="text-muted-foreground">Será descontado:</span>
                        <span className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                          -{formatCurrency(computedDiscountAmount)}
                        </span>

                        <span className="text-muted-foreground">Novo total:</span>
                        <span className="text-right font-bold">
                          {formatCurrency(
                            Math.max(
                              0,
                              subtotal - computedDiscountAmount + (serviceFeeEnabled && serviceFeeAllowed ? (subtotal - computedDiscountAmount) * serviceFeeRate : 0),
                            ),
                          )}
                        </span>
                      </div>

                      {/* Motivo (se configurado) */}
                      {requireReason && (
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1">
                            <FileText className="h-3 w-3 text-amber-600" />
                            Motivo *
                          </Label>
                          <Input
                            type="text"
                            placeholder="Ex: Cliente frequente"
                            value={discountReason}
                            onChange={(e) => setDiscountReason(e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                      )}

                      {/* Senha de autorização (sempre obrigatória) */}
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <Lock className="h-3 w-3 text-amber-600" />
                          Senha de autorização *
                        </Label>
                        <div className="flex gap-1">
                          <Input
                            type="password"
                            inputMode="numeric"
                            placeholder="Senha do operador autorizado"
                            value={discountPassword}
                            onChange={(e) => setDiscountPassword(e.target.value)}
                            className="h-9 text-sm flex-1"
                            disabled={discountAuthorized}
                          />
                          <Button
                            type="button"
                            variant={discountAuthorized ? "default" : "outline"}
                            size="sm"
                            className="shrink-0 h-9 px-3 text-xs"
                            disabled={discountAuthorized}
                            onClick={async () => {
                              if (!discountPassword) {
                                toast.error("Digite a senha");
                                return;
                              }
                              const { data: users, error } = await supabase
                                .from("establishment_users")
                                .select("display_name, discount_password, max_discount_percent")
                                .eq("establishment_owner_id", user?.id || "")
                                .eq("is_active", true) as any;

                              if (error) {
                                toast.error("Erro ao verificar senha");
                                return;
                              }

                              const authorizer = (users || []).find(
                                (u: any) => u.discount_password === discountPassword
                              );

                              if (!authorizer) {
                                toast.error("Senha incorreta");
                                setDiscountPassword("");
                                return;
                              }

                              const discountPercent = discountTypeChosen === "percent"
                                ? parseFloat(discountValue) || 0
                                : subtotal > 0 ? ((parseFloat(discountValue) || 0) / subtotal) * 100 : 0;

                              const maxAllowed = authorizer.max_discount_percent ?? 100;

                              if (discountPercent > maxAllowed) {
                                toast.error(
                                  `Desconto acima do limite de ${authorizer.display_name || "operador"} (máx ${maxAllowed}%)`
                                );
                                setDiscountPassword("");
                                return;
                              }

                              setDiscountAuthorized(true);
                              setDiscountAuthorizedBy(authorizer.display_name || "Operador");
                              toast.success(`Autorizado por ${authorizer.display_name || "operador"}`);
                            }}
                          >
                            {discountAuthorized ? "✓" : "OK"}
                          </Button>
                        </div>
                        {discountAuthorized && discountAuthorizedBy && (
                          <p className="text-xs text-emerald-600">Por: {discountAuthorizedBy}</p>
                        )}
                      </div>

                      {/* Ações Confirmar / Corrigir */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="flex-1"
                          onClick={() => {
                            setDiscountStage("typing");
                            setDiscountAuthorized(false);
                            setDiscountAuthorizedBy("");
                            setDiscountPassword("");
                          }}
                        >
                          Corrigir
                        </Button>
                        <Button
                          type="button"
                          className="flex-1"
                          disabled={
                            !discountAuthorized ||
                            (requireReason && !discountReason.trim()) ||
                            previewExceedsSubtotal
                          }
                          onClick={() => {
                            const amt = computedDiscountAmount;
                            const pct = subtotal > 0 ? (amt / subtotal) * 100 : 0;
                            setAppliedDiscount({
                              type: discountTypeChosen as DiscountType,
                              rawValue: discountValue,
                              amount: amt,
                              percent: pct,
                              reason: discountReason.trim() || undefined,
                              authorizedBy: discountAuthorizedBy || undefined,
                            });
                            setDiscountStage("applied");
                            toast.success("Desconto aplicado");
                          }}
                        >
                          Confirmar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Service Fee Toggle — só aparece se ativado nas configurações */}
                {serviceFeeAllowed && (
                  <div className="flex items-center justify-between">
                    <Label htmlFor="service-fee" className="text-sm cursor-pointer">
                      Taxa de serviço ({serviceFeePercentage}%)
                    </Label>
                    <Switch
                      id="service-fee"
                      checked={serviceFeeEnabled}
                      onCheckedChange={setServiceFeeEnabled}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            </div>

            {/* Totals - fixed at bottom */}
            <Card className="bg-primary/5 border-primary/20 shrink-0">
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Desconto</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                {serviceFeeAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Taxa de serviço</span>
                    <span>{formatCurrency(serviceFeeAmount)}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">TOTAL</span>
                  <motion.span
                    key={total}
                    initial={{ opacity: 0.4 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    className="font-bold text-2xl text-primary"
                  >
                    {formatCurrency(total)}
                  </motion.span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Payment */}
          <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
            {/* Charge mode segmented control */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-muted/50 rounded-lg">
              <Button
                type="button"
                variant={chargeMode === "all" ? "default" : "ghost"}
                size="sm"
                className="text-xs h-9"
                onClick={() => {
                  setChargeMode("all");
                  setSplitEnabled(false);
                  clearSelection();
                }}
              >
                Tudo
              </Button>
              <Button
                type="button"
                variant={chargeMode === "split-forms" ? "default" : "ghost"}
                size="sm"
                className="text-xs h-9"
                onClick={() => {
                  setChargeMode("split-forms");
                  setSplitEnabled(true);
                  if (splitPayments.length === 0) addSplitPayment();
                  clearSelection();
                }}
              >
                Várias formas
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      variant={chargeMode === "by-product" ? "default" : "ghost"}
                      size="sm"
                      className="text-xs h-9 w-full"
                      disabled={!supportsByProduct}
                      onClick={() => {
                        setChargeMode("by-product");
                        setSplitEnabled(false);
                        setSplitPayments([]);
                      }}
                    >
                      Por produto
                    </Button>
                  </span>
                </TooltipTrigger>
                {!supportsByProduct && (
                  <TooltipContent side="bottom">
                    Disponível apenas para comandas individuais com itens persistidos
                  </TooltipContent>
                )}
              </Tooltip>
            </div>

            {/* Selection summary (by-product) */}
            {isByProduct && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {selectedItemQtys.size} de {selectableItems.length} itens — {formatCurrency(selectedSubtotal)}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={selectAllPending}
                      disabled={selectableItems.length === 0}
                    >
                      Todos
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={clearSelection}
                      disabled={selectedItemQtys.size === 0}
                    >
                      Limpar
                    </Button>
                  </div>
                </div>
                {pendingSubtotal - selectedSubtotal > 0.005 && (
                  <p className="text-xs text-muted-foreground">
                    Fica em aberto: {formatCurrency(pendingSubtotal - selectedSubtotal)}
                  </p>
                )}
                {selectedItemQtys.size === 0 && (
                  <p className="text-xs text-amber-600">
                    Selecione ao menos um item à esquerda para continuar.
                  </p>
                )}
              </div>
            )}

            <AnimatePresence mode="wait">
              {splitEnabled ? (
                <motion.div
                  key="split"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  {/* Split Payments List */}
                  {splitPayments.map((payment, index) => (
                    <Card key={payment.id}>
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">Forma {index + 1}</Badge>
                          {splitPayments.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removeSplitPayment(payment.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <Select
                          value={payment.method}
                          onValueChange={(v) =>
                            updateSplitPayment(payment.id, { method: v as PaymentMethod })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethods.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                <div className="flex items-center gap-2">
                                  <m.icon className={cn("h-4 w-4", m.color)} />
                                  {m.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <CurrencyInput
                          value={payment.amount}
                          onChange={(v) => updateSplitPayment(payment.id, { amount: v })}
                          placeholder="Valor"
                        />
                      </CardContent>
                    </Card>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={addSplitPayment}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar forma
                  </Button>

                  {/* Split Summary */}
                  <div className="p-3 bg-muted rounded-lg space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Pago:</span>
                      <span className="font-medium">{formatCurrency(splitTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Restante:</span>
                      <span
                        className={cn(
                          "font-medium",
                          Math.abs(splitRemaining) < 0.01
                            ? "text-green-600"
                            : "text-destructive"
                        )}
                      >
                        {formatCurrency(splitRemaining)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="single"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {/* Payment Methods */}
                  <div className="grid grid-cols-3 gap-2">
                    {paymentMethods.map((method) => (
                      <Button
                        key={method.id}
                        type="button"
                        variant="outline"
                        className={cn(
                          "h-20 flex-col gap-2 relative overflow-hidden",
                          selectedMethod === method.id &&
                            "border-primary bg-primary/10 ring-2 ring-primary/20"
                        )}
                        onClick={() => setSelectedMethod(method.id)}
                      >
                        <method.icon
                          className={cn(
                            "h-6 w-6 transition-colors",
                            selectedMethod === method.id
                              ? method.color
                              : "text-muted-foreground"
                          )}
                        />
                        <span className="text-xs font-medium">{method.label}</span>
                        {selectedMethod === method.id && (
                          <motion.div
                            layoutId="payment-indicator"
                            className="absolute bottom-0 left-0 right-0 h-1 bg-primary"
                          />
                        )}
                      </Button>
                    ))}
                  </div>

                  {/* Cash Fields */}
                  {selectedMethod === "dinheiro" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Valor Recebido</Label>
                        <CurrencyInput
                          value={cashReceived}
                          onChange={setCashReceived}
                          placeholder="0,00"
                          className="text-lg h-12"
                        />
                      </div>

                      {/* Quick Value Buttons */}
                      <div className="grid grid-cols-5 gap-2">
                        {quickValues.map((value) => (
                          <Button
                            key={value}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickValue(value)}
                            className="text-xs"
                          >
                            R$ {value}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleExactValue}
                          className="text-xs"
                        >
                          Exato
                        </Button>
                      </div>

                      {/* Change Display */}
                      {cashReceivedNum > 0 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={cn(
                            "p-4 rounded-lg text-center",
                            cashReceivedNum >= total
                              ? "bg-green-100 dark:bg-green-900/30"
                              : "bg-destructive/10"
                          )}
                        >
                          <span className="text-sm text-muted-foreground block mb-1">
                            Troco
                          </span>
                          <span
                            className={cn(
                              "text-2xl font-bold",
                              cashReceivedNum >= total
                                ? "text-green-600"
                                : "text-destructive"
                            )}
                          >
                            {formatCurrency(changeAmount)}
                          </span>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* Card Fields */}
                  {selectedMethod === "cartao" && (
                    <div className="space-y-4">
                      {/* Card Type Selection */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-14",
                            cardType === "credito" &&
                              "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          )}
                          onClick={() => setCardType("credito")}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <CreditCard
                              className={cn(
                                "h-5 w-5",
                                cardType === "credito"
                                  ? "text-blue-600"
                                  : "text-muted-foreground"
                              )}
                            />
                            <span className="text-xs">Crédito</span>
                          </div>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-14",
                            cardType === "debito" &&
                              "border-green-500 bg-green-50 dark:bg-green-900/20"
                          )}
                          onClick={() => setCardType("debito")}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <CreditCard
                              className={cn(
                                "h-5 w-5",
                                cardType === "debito"
                                  ? "text-green-600"
                                  : "text-muted-foreground"
                              )}
                            />
                            <span className="text-xs">Débito</span>
                          </div>
                        </Button>
                      </div>

                      {/* Installments (Credit only) */}
                      {cardType === "credito" && (
                        <div className="space-y-2">
                          <Label>Parcelas</Label>
                          <Select value={installments} onValueChange={setInstallments}>
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                                <SelectItem key={i} value={String(i)}>
                                  <span className="font-medium">{i}x</span>{" "}
                                  <span className="text-muted-foreground">
                                    de {formatCurrency(total / i)}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PIX */}
                  {selectedMethod === "pix" && (
                    <div className="p-6 bg-muted/50 rounded-lg text-center space-y-3">
                      <QrCode className="h-16 w-16 mx-auto text-purple-600 opacity-50" />
                      <p className="text-sm text-muted-foreground">
                        Aguardando pagamento via PIX
                      </p>
                      <p className="text-2xl font-bold text-primary">
                        {formatCurrency(total)}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isProcessing}
            size="lg"
            className="gap-2 min-w-[200px]"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Confirmar {formatCurrency(total)}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Confirmação de remoção de item */}
    <AlertDialog open={!!itemToRemove} onOpenChange={(o) => { if (!o) setItemToRemove(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover item?</AlertDialogTitle>
          <AlertDialogDescription>
            {itemToRemove && (
              <>
                <span className="font-medium text-foreground">
                  {itemToRemove.quantity}x {itemToRemove.product_name}
                </span>{" "}
                — {formatCurrency(itemToRemove.subtotal)} será removido da conta.
                <br />
                Esta ação não pode ser desfeita.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemovingItem}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isRemovingItem}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              if (!itemToRemove) return;
              const id = itemToRemove.id;
              setOptimisticallyRemoved((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
              });
              removeItem(id);
              setItemToRemove(null);
            }}
          >
            {isRemovingItem ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Removendo...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Remover
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Dialog para adicionar item */}
    <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Adicionar item à comanda
          </DialogTitle>
          <DialogDescription>
            Busque um produto para incluir no pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar por nome, código ou categoria..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[260px] border rounded-md">
            <div className="p-1">
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum produto encontrado.
                </p>
              ) : (
                filteredProducts.slice(0, 200).map((p: any) => {
                  const isSelected = p.id === selectedProductId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProductId(p.id)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors",
                        isSelected
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        {p.category && (
                          <p className="text-xs text-muted-foreground truncate">{p.category}</p>
                        )}
                      </div>
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(Number(p.price_salon) || 0)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {selectedProduct && (
            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  Selecionado: <span className="font-medium">{selectedProduct.name}</span>
                </p>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(Number(selectedProduct.price_salon) || 0)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Quantidade</Label>
                  <Input
                    type="number"
                    min={1}
                    value={addItemQty}
                    onChange={(e) => setAddItemQty(e.target.value)}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Observações (opcional)</Label>
                  <Input
                    type="text"
                    placeholder="Ex: sem cebola"
                    value={addItemNotes}
                    onChange={(e) => setAddItemNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => setAddItemDialogOpen(false)}
            disabled={isAddingItem}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmAddItem}
            disabled={!selectedProduct || !targetComandaIdForAdd || isAddingItem}
          >
            {isAddingItem ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adicionando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
