import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useDeliveryOrders, DeliveryOrder } from "@/hooks/use-delivery-orders";
import { OrderCard } from "./OrderCard";
import { OrderDetailDialog } from "./OrderDetailDialog";
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
  orderType: "delivery" | "pickup" | "completed" | "scheduled";
  onOrderTypeChange: (t: "delivery" | "pickup" | "completed" | "scheduled") => void;
  counts: { delivery: number; pickup: number; completed: number; scheduled?: number };
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

type TurnoFilter = "all" | "manha" | "tarde" | "noite";

const TURNOS: { value: TurnoFilter; label: string; start: number; end: number }[] = [
  { value: "manha", label: "Manhã (06h–12h)", start: 6, end: 12 },
  { value: "tarde", label: "Tarde (12h–18h)", start: 12, end: 18 },
  { value: "noite", label: "Noite (18h–00h)", start: 18, end: 24 },
];

export const OrdersKanban = ({ orderType, onOrderTypeChange, counts = { delivery: 0, pickup: 0, completed: 0 } }: Props) => {
  const { data: allOrders = [] } = useDeliveryOrders();
  const [completedDate, setCompletedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sessionFilter, setSessionFilter] = useState<string>("none");
  const [turnoFilter, setTurnoFilter] = useState<TurnoFilter>("all");
  const [selectedCompleted, setSelectedCompleted] = useState<DeliveryOrder | null>(null);
  const [selectedScheduled, setSelectedScheduled] = useState<DeliveryOrder | null>(null);
  const { data: sessions = [] } = useCashierSessionsByDay(completedDate);

  // Polling: re-render a cada 60s para promover agendados → novos
  const [now, setNow] = useState(() => new Date());
  const promotedRef = useRef(new Set<string>());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Pedidos agendados (scheduled_for no futuro, qualquer tipo)
  const scheduledOrders = useMemo(
    () => allOrders.filter((o) =>
      o.scheduled_for &&
      o.status === "pending" &&
      new Date(o.scheduled_for) > now
    ).sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime()),
    [allOrders, now],
  );

  // Notificar quando pedido agendado entrar em preparo (chegar a hora)
  useEffect(() => {
    const arrivalSet = allOrders.filter((o) =>
      o.scheduled_for &&
      o.status === "pending" &&
      new Date(o.scheduled_for) <= now &&
      !promotedRef.current.has(o.id)
    );
    for (const o of arrivalSet) {
      promotedRef.current.add(o.id);
      toast(`Pedido agendado #${o.order_number} de ${o.customer_name} — hora de preparar!`, {
        duration: 8000,
      });
    }
  }, [allOrders, now]);

  const activeOrders = useMemo(
    () => allOrders.filter((o) => {
      if (orderType === "completed" || orderType === "scheduled") return false;
      if (o.order_type !== orderType) return false;
      // Excluir agendados que ainda não chegaram
      if (o.scheduled_for && o.status === "pending" && new Date(o.scheduled_for) > now) return false;
      return true;
    }),
    [allOrders, orderType, now],
  );

  const columns = orderType === "delivery" ? deliveryColumns : pickupColumns;

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

    return allOrders
      .filter((o) => {
        if (o.status !== "completed") return false;

        if (sessionFilter !== "none") {
          return (o as any).cashier_session_id === sessionFilter;
        }

        const ts = new Date(o.delivered_at || o.updated_at || o.created_at).getTime();
        if (ts < dayStart || ts >= dayEnd) return false;

        if (turnoFilter !== "all") {
          const turno = TURNOS.find((t) => t.value === turnoFilter)!;
          const hour = new Date(o.delivered_at || o.updated_at || o.created_at).getHours();
          if (hour < turno.start || hour >= turno.end) return false;
        }

        return true;
      })
      .slice(0, 100);
  }, [allOrders, completedDate, sessionFilter, turnoFilter]);

  const selectedSession = sessions.find((s) => s.id === sessionFilter) || null;

  return (
    <div className="space-y-3">
      <Tabs value={orderType} onValueChange={(v) => onOrderTypeChange(v as "delivery" | "pickup" | "completed" | "scheduled")}>
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
          <TabsTrigger value="scheduled" className="gap-2">
            <span>Agendados</span>
            {scheduledOrders.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {scheduledOrders.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <span>Concluídos</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {counts.completed}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {orderType === "scheduled" ? (
        <div className="space-y-3">
          {scheduledOrders.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              Nenhum pedido agendado no momento
            </p>
          ) : (
            <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {scheduledOrders.map((o) => {
                const scheduledDate = new Date(o.scheduled_for!);
                const diffMs = scheduledDate.getTime() - now.getTime();
                const diffMin = Math.floor(diffMs / 60_000);
                const diffH = Math.floor(diffMin / 60);
                const remainMin = diffMin % 60;
                const countdown = diffH > 0
                  ? `em ${diffH}h${remainMin > 0 ? ` ${remainMin}min` : ""}`
                  : `em ${diffMin}min`;

                return (
                  <div
                    key={o.id}
                    className="p-3 rounded border bg-card text-xs hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => setSelectedScheduled(o)}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold">#{o.order_number}</span>
                      <span className="text-primary font-medium">
                        {format(scheduledDate, "HH:mm")} · {countdown}
                      </span>
                    </div>
                    <p className="truncate text-muted-foreground mb-1">{o.customer_name}</p>
                    <div className="flex justify-between items-center">
                      <p className="font-semibold text-sm">{formatBRL(Number(o.total))}</p>
                      <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal capitalize">
                        {o.order_type === "delivery" ? "Delivery" : "Retirada"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedScheduled && (
            <OrderDetailDialog
              open={!!selectedScheduled}
              onOpenChange={(open) => { if (!open) setSelectedScheduled(null); }}
              order={selectedScheduled}
            />
          )}
        </div>
      ) : orderType === "completed" ? (
        <div className="space-y-4">
          {/* Filtros em linha */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">Dia</span>
              <Input
                type="date"
                value={completedDate}
                onChange={(e) => {
                  setCompletedDate(e.target.value);
                  setSessionFilter("none");
                  setTurnoFilter("all");
                }}
                className="h-9 text-xs w-[150px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">Sessão</span>
              <Select value={sessionFilter} onValueChange={(v) => {
                setSessionFilter(v);
                if (v !== "none") setTurnoFilter("all");
              }}>
                <SelectTrigger className="h-9 text-xs w-[220px]">
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
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">Turno</span>
              <Select
                value={turnoFilter}
                onValueChange={(v) => setTurnoFilter(v as TurnoFilter)}
                disabled={sessionFilter !== "none"}
              >
                <SelectTrigger className="h-9 text-xs w-[180px]">
                  <SelectValue placeholder="Todos os turnos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os turnos</SelectItem>
                  {TURNOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <span className="text-sm text-muted-foreground pb-2">
                {completed.length} pedido{completed.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {selectedSession && (
            <div className="rounded border bg-muted/50 p-3 text-xs flex gap-4 flex-wrap w-fit">
              <div>
                <span className="font-medium text-foreground">
                  {selectedSession.operator_name || "Operador"}
                </span>
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

          <ScrollArea className="h-[calc(100vh-420px)]">
            {completed.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhum pedido concluído neste período
              </p>
            ) : (
              <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 pr-2">
                {completed.map((o: DeliveryOrder) => {
                  const sid = (o as any).cashier_session_id as string | null;
                  const operator = sid ? operatorBySession.get(sid) : null;
                  return (
                    <div
                      key={o.id}
                      className="p-3 rounded border bg-card text-xs hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => setSelectedCompleted(o)}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold">#{o.order_number}</span>
                        <span className="text-muted-foreground">
                          {format(new Date(o.delivered_at || o.created_at), "HH:mm")}
                        </span>
                      </div>
                      <p className="truncate text-muted-foreground mb-1">{o.customer_name}</p>
                      <div className="flex justify-between items-center">
                        <p className="font-semibold text-sm">{formatBRL(Number(o.total))}</p>
                        {operator && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                            {operator}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {selectedCompleted && (
            <OrderDetailDialog
              open={!!selectedCompleted}
              onOpenChange={(open) => { if (!open) setSelectedCompleted(null); }}
              order={selectedCompleted}
            />
          )}
        </div>
      ) : (
        <div className="flex gap-3 pb-2 w-full">
          {columns.map((column) => {
            const colOrders = activeOrders.filter((o) => column.match.includes(o.status));
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
      )}
    </div>
  );
};
