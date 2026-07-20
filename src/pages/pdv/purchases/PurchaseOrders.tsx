import { useState } from "react";
import { Plus, Package, Send, CheckCircle2, Clock, Search, Filter, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsivePageHeader } from "@/components/ui/responsive-page-header";
import { usePDVPurchaseOrders } from "@/hooks/use-pdv-purchase-orders";
import { PurchaseOrderCard } from "@/components/pdv/purchases/PurchaseOrderCard";
import { PurchaseOrderDialog } from "@/components/pdv/purchases/PurchaseOrderDialog";
import { ReceiptQRCard } from "@/components/pdv/purchases/ReceiptQRCard";
import { formatCurrency } from "@/lib/whatsapp-message";

export default function PurchaseOrders() {
  const { orders, isLoading, stats } = usePDVPurchaseOrders();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.supplier?.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || o.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const statCards = [
    {
      title: "Total de Pedidos",
      value: stats.total.toString(),
      icon: Package,
    },
    {
      title: "Aguardando Envio",
      value: stats.draft.toString(),
      icon: Clock,
    },
    {
      title: "Enviados",
      value: stats.sent.toString(),
      icon: Send,
    },
    {
      title: "Valor em Aberto",
      value: formatCurrency(stats.totalValue),
      icon: DollarSign,
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <ResponsivePageHeader
        title="Pedidos de Compra"
        subtitle="Gerencie seus pedidos de compra e envie via WhatsApp"
      >
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Pedido
        </Button>
      </ResponsivePageHeader>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <stat.icon className="h-4 w-4" />
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{stat.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* QR de recebimento: fica aqui porque é onde o pedido vive — quem
          acompanha os pedidos é quem imprime e cola o código na doca. */}
      <ReceiptQRCard />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número ou fornecedor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="sent">Enviado</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="partial">Parcial</SelectItem>
            <SelectItem value="received">Recebido</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum pedido encontrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter !== "all"
                ? "Tente ajustar os filtros de busca"
                : "Crie seu primeiro pedido de compra"}
            </p>
            {!searchQuery && statusFilter === "all" && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Pedido
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredOrders.map((order) => (
            <PurchaseOrderCard key={order.id} order={order} />
          ))}
        </div>
      )}

      <PurchaseOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
