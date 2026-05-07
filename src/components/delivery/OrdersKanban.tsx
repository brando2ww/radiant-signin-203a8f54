import { useMemo, useState } from "react";
import { useDeliveryOrders, DeliveryOrder } from "@/hooks/use-delivery-orders";
import { OrderCard } from "./OrderCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { formatBRL } from "@/lib/format";

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

  const orders = useMemo(
    () => allOrders.filter((o) => o.order_type === orderType),
    [allOrders, orderType],
  );

  const columns = orderType === "delivery" ? deliveryColumns : pickupColumns;

  const completed = useMemo(() => {
    const dayStart = new Date(completedDate + "T00:00:00").getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return orders
      .filter((o) => {
        if (o.status !== "completed") return false;
        const ts = new Date(o.delivered_at || o.updated_at || o.created_at).getTime();
        return ts >= dayStart && ts < dayEnd;
      })
      .slice(0, 20);
  }, [orders, completedDate]);

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
        <Card className="w-[280px] shrink-0 flex flex-col">
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
              onChange={(e) => setCompletedDate(e.target.value)}
              className="h-8 text-xs"
            />
          </CardHeader>
          <CardContent className="flex-1 p-2">
            <ScrollArea className="h-[calc(100vh-440px)]">
              <div className="space-y-1 pr-3">
                {completed.map((o: DeliveryOrder) => (
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
                    <p className="font-medium">{formatBRL(Number(o.total))}</p>
                  </div>
                ))}
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
