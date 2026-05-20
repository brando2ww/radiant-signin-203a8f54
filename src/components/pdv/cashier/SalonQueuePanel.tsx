import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { formatTableLabel } from "@/utils/formatTableNumber";
import {
  Hourglass,
  RefreshCw,
  Users,
  Receipt,
  UtensilsCrossed,
  Soup,
  Bike,
  Search,
  X,
} from "lucide-react";
import { usePDVComandas, Comanda, ComandaItem } from "@/hooks/use-pdv-comandas";
import { usePDVTables, PDVTable } from "@/hooks/use-pdv-tables";
import { SalonQueueCard } from "./SalonQueueCard";
import { DeliveryQueueCard } from "./DeliveryQueueCard";
import { DeliveryPaymentDialog } from "./DeliveryPaymentDialog";
import { usePDVDeliveryQueue } from "@/hooks/use-pdv-delivery-queue";
import { usePDVDeliveryCheckout } from "@/hooks/use-pdv-delivery-checkout";
import { type DeliveryOrder, useUpdateOrderStatus } from "@/hooks/use-delivery-orders";
import { printMotoboyReceipt } from "@/lib/print-motoboy-receipt";
import { useDeliverySettings } from "@/hooks/use-delivery-settings";
import { AlertTriangle } from "lucide-react";

interface SalonQueuePanelProps {
  isOpen: boolean;
  onSelectComanda: (comanda: Comanda, items: ComandaItem[]) => void;
  onSelectTablePending: (
    table: PDVTable,
    comandas: Comanda[],
    items: ComandaItem[],
  ) => void;
  onOpenDirectCharge: () => void;
}

type SortOption = "time" | "value" | "table" | "name";

const GROUP_COLORS = [
  "border-l-blue-500",
  "border-l-emerald-500",
  "border-l-amber-500",
  "border-l-pink-500",
  "border-l-violet-500",
  "border-l-cyan-500",
];
function getGroupColor(orderId: string | null) {
  if (!orderId) return "border-l-slate-400";
  let h = 0;
  for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) | 0;
  return GROUP_COLORS[Math.abs(h) % GROUP_COLORS.length];
}

export function SalonQueuePanel({
  isOpen,
  onSelectComanda,
  onSelectTablePending,
  onOpenDirectCharge,
}: SalonQueuePanelProps) {
  const queryClient = useQueryClient();
  const { comandas, getItemsByComanda, getPendingPaymentComandas } = usePDVComandas();
  const { tables } = usePDVTables();
  const [tab, setTab] = useState<"salon" | "delivery">("salon");
  const [sortBy, setSortBy] = useState<SortOption>("time");
  const [paymentOrder, setPaymentOrder] = useState<DeliveryOrder | null>(null);

  const delivery = usePDVDeliveryQueue();
  const { registerDeliveryPayment } = usePDVDeliveryCheckout();
  const updateOrderStatus = useUpdateOrderStatus();
  const { data: deliverySettings } = useDeliverySettings();
  const overdueMinutes = deliverySettings?.payment_overdue_minutes ?? 30;

  const overduePaymentOrders = useMemo(() => {
    const now = Date.now();
    return delivery.all.filter((o: DeliveryOrder) => {
      const offline = ["cash", "dinheiro", "credit", "credito", "debit", "debito"].includes(
        o.payment_method,
      );
      if (!offline || o.payment_status === "paid") return false;
      if (o.status !== "delivering") return false;
      const mins = (now - new Date(o.updated_at).getTime()) / 60000;
      return mins > overdueMinutes;
    });
  }, [delivery.all, overdueMinutes]);

  const NEXT: Partial<Record<DeliveryOrder["status"], DeliveryOrder["status"]>> = {
    pending: "preparing",
    confirmed: "preparing",
    preparing: "ready",
    ready: "delivering",
    delivering: "completed",
  };

  const handleAdvanceStatus = (order: DeliveryOrder) => {
    const next = NEXT[order.status];
    if (!next) return;
    updateOrderStatus.mutate({ id: order.id, status: next });
  };

  const handlePrintMotoboy = (order: DeliveryOrder) => {
    printMotoboyReceipt(order);
  };

  const tablesByOrderId = useMemo(() => {
    const m = new Map<string, PDVTable>();
    tables.forEach((t) => {
      if (t.current_order_id) m.set(t.current_order_id, t);
    });
    return m;
  }, [tables]);

  const pendingComandas = getPendingPaymentComandas().filter((c) => {
    // Defesa: comanda com order_id mas sem mesa viva apontando para ele
    // significa que o pedido foi cancelado/liberado — não exibir.
    if (c.order_id && !tablesByOrderId.has(c.order_id)) return false;
    return true;
  });

  const openCountByOrderId = useMemo(() => {
    const m = new Map<string, number>();
    comandas.forEach((c) => {
      if (!c.order_id) return;
      if (c.status === "aberta" || c.status === "em_cobranca") {
        m.set(c.order_id, (m.get(c.order_id) ?? 0) + 1);
      }
    });
    return m;
  }, [comandas]);

  type GroupedItem = {
    key: string;
    table: PDVTable | null;
    label: string;
    color: string;
    comandas: Comanda[];
    total: number;
    oldestAt: number;
  };

  const groups = useMemo<GroupedItem[]>(() => {
    const map = new Map<string, GroupedItem>();
    pendingComandas.forEach((c) => {
      const key = c.order_id ?? `__avulsa__${c.id}`;
      const t = c.order_id ? tablesByOrderId.get(c.order_id) ?? null : null;
      const label = t
        ? formatTableLabel(t.table_number)
        : `Avulsa — ${c.customer_name ?? `#${c.comanda_number}`}`;
      const ts = new Date(c.closed_by_waiter_at ?? c.updated_at).getTime();
      const existing = map.get(key);
      if (existing) {
        existing.comandas.push(c);
        existing.total += c.subtotal;
        existing.oldestAt = Math.min(existing.oldestAt, ts);
      } else {
        map.set(key, {
          key,
          table: t,
          label,
          color: getGroupColor(c.order_id),
          comandas: [c],
          total: c.subtotal,
          oldestAt: ts,
        });
      }
    });

    const arr = Array.from(map.values());

    arr.forEach((g) => {
      g.comandas.sort((a, b) => {
        const at = new Date(a.closed_by_waiter_at ?? a.updated_at).getTime();
        const bt = new Date(b.closed_by_waiter_at ?? b.updated_at).getTime();
        return at - bt;
      });
    });

    arr.sort((a, b) => {
      switch (sortBy) {
        case "value":
          return b.total - a.total;
        case "table": {
          const an = a.table?.table_number ?? "zzz";
          const bn = b.table?.table_number ?? "zzz";
          return an.localeCompare(bn, "pt-BR", { numeric: true });
        }
        case "name": {
          const an = a.comandas[0]?.customer_name ?? a.label;
          const bn = b.comandas[0]?.customer_name ?? b.label;
          return an.localeCompare(bn, "pt-BR");
        }
        case "time":
        default:
          return a.oldestAt - b.oldestAt;
      }
    });

    return arr;
  }, [pendingComandas, tablesByOrderId, sortBy]);

  const totalCount = pendingComandas.length;
  const totalValue = pendingComandas.reduce((s, c) => s + c.subtotal, 0);

  // Pisca aba Delivery quando chega novo pedido
  const lastFirstId = useRef<string | null>(null);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const firstId = delivery.all[0]?.id ?? null;
    if (lastFirstId.current && firstId && firstId !== lastFirstId.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 3000);
      return () => clearTimeout(t);
    }
    lastFirstId.current = firstId;
  }, [delivery.all]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
    queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
    queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
    queryClient.invalidateQueries({ queryKey: ["pdv-delivery-queue"] });
  };

  const handleSelectGroupAll = (group: GroupedItem) => {
    if (!group.table) return;
    const items = group.comandas.flatMap((c) => getItemsByComanda(c.id));
    onSelectTablePending(group.table, group.comandas, items);
  };

  const handleConfirmOnline = async (order: DeliveryOrder) => {
    try {
      await registerDeliveryPayment({
        orderId: order.id,
        amount: Number(order.total) || 0,
        paymentMethod:
          order.payment_method === "credit"
            ? "credito"
            : order.payment_method === "debit"
              ? "debito"
              : (order.payment_method as any) === "pix"
                ? "pix"
                : "pix",
        source: "delivery_online",
      });
    } catch {
      /* toast handled */
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "salon" | "delivery")}
        className="flex flex-col h-full min-h-0"
      >
        <div className="px-3 pt-3 pb-2 border-b space-y-2">
          <div className="flex items-center justify-between gap-2">
            <TabsList className="h-8">
              <TabsTrigger value="salon" className="text-xs gap-1.5 h-6">
                <Soup className="h-3.5 w-3.5" />
                Salão
                {totalCount > 0 && (
                  <Badge className="bg-orange-500 text-white hover:bg-orange-500 h-4 px-1.5 text-[10px]">
                    {totalCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="delivery"
                className={cn(
                  "text-xs gap-1.5 h-6",
                  pulse && "animate-pulse",
                )}
              >
                <Bike className="h-3.5 w-3.5" />
                Delivery
                {delivery.actionableCount > 0 && (
                  <Badge className="bg-orange-500 text-white hover:bg-orange-500 h-4 px-1.5 text-[10px]">
                    {delivery.actionableCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleRefresh}
              title="Atualizar"
              aria-label="Atualizar"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {tab === "salon" && (
            <>
              {isOpen && totalCount > 0 ? (
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {totalCount} comanda{totalCount > 1 ? "s" : ""}
                    </span>{" "}
                    aguardando cobrança
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total:{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatBRL(totalValue)}
                    </span>
                  </div>
                </div>
              ) : (
                isOpen && (
                  <div className="text-xs text-muted-foreground">
                    Sem comandas na fila no momento.
                  </div>
                )
              )}

              {totalCount > 0 && (
                <Select
                  value={sortBy}
                  onValueChange={(v) => setSortBy(v as SortOption)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time">Mais antigas primeiro</SelectItem>
                    <SelectItem value="value">Maior valor</SelectItem>
                    <SelectItem value="table">Mesa</SelectItem>
                    <SelectItem value="name">Nome</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </>
          )}

          {tab === "delivery" && isOpen && (
            <div className="text-xs text-muted-foreground">
              {delivery.actionableCount > 0 ? (
                <>
                  <span className="font-semibold text-foreground">
                    {delivery.actionableCount}
                  </span>{" "}
                  pedido{delivery.actionableCount > 1 ? "s" : ""} aguardando ação
                </>
              ) : delivery.totalCount > 0 ? (
                <>{delivery.totalCount} em andamento</>
              ) : (
                "Sem pedidos de delivery."
              )}
            </div>
          )}
        </div>

        <TabsContent value="salon" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-4">
              {!isOpen ? (
                <div className="flex flex-col items-center justify-center text-muted-foreground py-12 text-center">
                  <Hourglass className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-xs">Abra o caixa para ver a fila do salão.</p>
                </div>
              ) : groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-muted-foreground py-12 text-center">
                  <UtensilsCrossed className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm font-medium text-foreground">Tudo em dia!</p>
                  <p className="text-xs mt-1">
                    Nenhuma comanda aguardando cobrança.
                  </p>
                </div>
              ) : (
                groups.map((group) => {
                  const isMulti = !!group.table && group.comandas.length > 1;
                  return (
                    <div key={group.key} className="space-y-2">
                      {isMulti && (
                        <div className="flex items-center justify-between gap-2 px-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                "w-1 h-4 rounded-sm",
                                group.color.replace("border-l-", "bg-"),
                              )}
                            />
                            <span className="font-semibold text-xs truncate">
                              {group.label}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {group.comandas.length} · {formatBRL(group.total)}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-[11px] gap-1 px-2"
                            onClick={() => handleSelectGroupAll(group)}
                          >
                            <Users className="h-3 w-3" />
                            Cobrar tudo
                          </Button>
                        </div>
                      )}

                      {group.comandas.map((c) => {
                        const items = getItemsByComanda(c.id);
                        const tableLabel = group.table
                          ? formatTableLabel(group.table.table_number)
                          : null;
                        const customer =
                          c.customer_name ?? `#${c.comanda_number}`;
                        const title = tableLabel
                          ? `${tableLabel} — ${customer}`
                          : `Avulsa — ${customer}`;
                        const siblings = c.order_id
                          ? Math.max(
                              0,
                              (openCountByOrderId.get(c.order_id) ?? 0) - 1,
                            )
                          : 0;
                        return (
                          <SalonQueueCard
                            key={c.id}
                            comanda={c}
                            items={items}
                            title={title}
                            borderColor={group.color}
                            siblingCount={siblings}
                            onCharge={() => onSelectComanda(c, items)}
                          />
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="delivery" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {isOpen && overduePaymentOrders.length > 0 && (
                <div className="flex items-start gap-2 p-2 rounded border border-destructive/40 bg-destructive/10 text-destructive text-[11px]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div>
                    <strong>{overduePaymentOrders.length}</strong> pedido(s) sem pagamento
                    registrado há mais de {overdueMinutes} min.
                  </div>
                </div>
              )}
              {!isOpen ? (
                <div className="flex flex-col items-center justify-center text-muted-foreground py-12 text-center">
                  <Hourglass className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-xs">
                    Abra o caixa para registrar pedidos de delivery.
                  </p>
                </div>
              ) : delivery.all.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-muted-foreground py-12 text-center">
                  <Bike className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm font-medium text-foreground">
                    Nenhum pedido pendente
                  </p>
                  <p className="text-xs mt-1">
                    Novos pedidos aparecem aqui automaticamente.
                  </p>
                </div>
              ) : (
                delivery.all.map((o) => (
                  <DeliveryQueueCard
                    key={o.id}
                    order={o}
                    onRegisterPayment={(order) => setPaymentOrder(order)}
                    onConfirmOnline={handleConfirmOnline}
                    onAdvanceStatus={handleAdvanceStatus}
                    onPrintMotoboy={handlePrintMotoboy}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {isOpen && tab === "salon" && (
        <div className="border-t p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 text-xs gap-2"
            onClick={onOpenDirectCharge}
          >
            <Receipt className="h-3.5 w-3.5" />
            Cobrar comanda avulsa / mesa direta
          </Button>
        </div>
      )}

      <DeliveryPaymentDialog
        order={paymentOrder}
        open={!!paymentOrder}
        onOpenChange={(o) => !o && setPaymentOrder(null)}
      />
    </div>
  );
}
