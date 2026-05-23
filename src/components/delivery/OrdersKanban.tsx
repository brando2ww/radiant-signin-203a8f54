import { useMemo, useState } from "react";
import { useDeliveryOrders, DeliveryOrder } from "@/hooks/use-delivery-orders";
import { OrderCard } from "./OrderCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { useCashierSessionsByDay } from "@/hooks/use-cashier-sessions-by-day";

interface Props {
  orderType: "delivery" | "pickup";
  onOrderTypeChange: (t: "delivery" | "pickup") => void;
  counts: { delivery: number; pickup: number };
}

const deliveryColumns = [
  { id: "novos", label: "Novos", color: "bg-yellow-500", match: ["pending"] },
  { id: "preparo", label: "Em Preparo", color: "bg-orange-500", match: ["confirmed", "preparing"] },
  { id: "pronto", label: "Pronto", color: "bg-purple-500", match: ["ready"] },
  { id: "saiu", label: "Saiu para Entrega", color: "bg-indigo-500", match: ["delivering"] },
];

const pickupColumns = [
  { id: "novos", label: "Novos", color: "bg-yellow-500", match: ["pending"] },
  { id: "preparo", label: "Em Preparo", color: "bg-orange-500", match: ["confirmed", "preparing"] },
  { id: "pronto", label: "Pronto para Retirar", color: "bg-purple-500", match: ["ready"] },
];

export const OrdersKanban = ({ orderType, onOrderTypeChange, counts = { delivery: 0, pickup: 0 } }: Props) => {
  const { data: allOrders = [] } = useDeliveryOrders();
  const [completedDate, setCompletedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sessionFilter, setSessionFilter] = useState<string>("none"); // 'none' = all sessions of the day
  const { data: sessions = [] } = useCashierSessionsByDay(completedDate);

  const orders = useMemo(
    () => allOrders.filter((o) => o.order_type === orderType),
    [allOrders, orderType],
  );

  const columns = orderType === "delivery" ? deliveryColumns : pickupColumns;

  // Map sessionId -> operator name (for badges per card)
  const operatorBySession = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) {
      if (s.id) m.set(s.id, s.operator_name || "Operador");
    }
    return m;
  }, [sessions]);

  const completed = useMemo(() => {
    const dayStart = new Date(completedDate + "T00:00:00").getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return orders
      .filter((o) => {
        if (o.status !== "completed") return false;
        if (sessionFilter !== "none") {
          return (o as any).cashier_session_id === sessionFilter;
        }
        const ts = new Date(o.delivered_at || o.updated_at || o.created_at).getTime();
        return ts >= dayStart && ts < dayEnd;
      })
      .slice(0, 50);
  }, [orders, completedDate, sessionFilter]);

  const selectedSession = sessions.find((s) => s.id === sessionFilter) || null;

  return (
    <div className="space-y-3">
      {/* Tabs discretas */}
      <Tabs value={orderType} onValueChange={(v) => onOrderTypeChange(v as "delivery" | "pickup")}>
        <TabsList>
          <TabsTrigger value="delivery" className="gap-2">
            <span>Delivery</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {counts.delivery}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pickup" className="gap-2">
            <span>Retirada</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {counts.pickup}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex gap-4 w-full">
        <div className="flex-1 min-w-0">
          <div className="flex gap-3 pb-2 w-full">
            {columns.map((column) => {
              const colOrders = orders.filter((o) => column.match.includes(o.status));
              return (
                <Card key={column.id} className="flex flex-col flex-1 min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${column.color}`} />
                        {column.label}
                      </span>
                      <Badge variant="secondary">{colOrders.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 p-2">
                    <ScrollArea className="h-[calc(100vh-380px)]">
                      <div className="space-y-2 pr-3">
                        {colOrders.map((order) => (
                          <OrderCard key={order.id} order={order} />
                        ))}
                        {colOrders.length === 0 && (
                          <p className="text-center text-sm text-muted-foreground py-4">
                            Nenhum pedido
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Concluídos lateral */}
        <Card className="w-[300px] shrink-0 flex flex-col">
          <CardHeader className="pb-3 space-y-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Concluídos
              </span>
              <Badge variant="secondary">{completed.length}</Badge>
            </CardTitle>

            <Input
              type="date"
              value={completedDate}
              onChange={(e) => {
                setCompletedDate(e.target.value);
                setSessionFilter("none");
              }}
              className="h-8 text-xs"
            />

            <Select value={sessionFilter} onValueChange={setSessionFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Todas as sessões do dia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todas as sessões do dia</SelectItem>
                {sessions.map((s) => {
                  const openTime = format(new Date(s.opened_at), "HH:mm", { locale: ptBR });
                  const closeTime = s.closed_at
                    ? format(new Date(s.closed_at), "HH:mm", { locale: ptBR })
                    : "aberto";
                  const op = s.operator_name || "Operador";
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {op} · {openTime} → {closeTime}
                    </SelectItem>
                  );
                })}
                {sessions.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nenhuma sessão neste dia
                  </div>
                )}
              </SelectContent>
            </Select>

            {selectedSession && (
              <div className="rounded border bg-muted/50 p-2 text-xs space-y-0.5">
                <div className="font-medium text-foreground">
                  {selectedSession.operator_name || "Operador"}
                </div>
                <div className="text-muted-foreground">
                  Abertura: {format(new Date(selectedSession.opened_at), "dd/MM HH:mm", { locale: ptBR })}
                  {" · "}
                  {formatBRL(Number(selectedSession.opening_balance || 0))}
                </div>
                <div className="text-muted-foreground">
                  {selectedSession.closed_at
                    ? `Fechada: ${format(new Date(selectedSession.closed_at), "dd/MM HH:mm", { locale: ptBR })}`
                    : "Status: aberto"}
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 p-2">
            <ScrollArea className="h-[calc(100vh-520px)]">
              <div className="space-y-1 pr-3">
                {completed.map((o: DeliveryOrder) => {
                  const sid = (o as any).cashier_session_id as string | null;
                  const operator = sid ? operatorBySession.get(sid) : null;
                  return (
                    <div
                      key={o.id}
                      className="p-2 rounded border bg-card text-xs hover:bg-muted transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold">#{o.order_number}</span>
                        <span className="text-muted-foreground">
                          {format(new Date(o.delivered_at || o.created_at), "HH:mm")}
                        </span>
                      </div>
                      <p className="truncate text-muted-foreground">{o.customer_name}</p>
                      <div className="flex justify-between items-center mt-0.5">
                        <p className="font-medium">{formatBRL(Number(o.total))}</p>
                        {operator && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                            {operator}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
                {completed.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Nenhum concluído
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
