import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  MessageCircle,
  MoreVertical,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  Package,
  PackageCheck,
  Trash2,
  Truck,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { PurchaseOrder, usePDVPurchaseOrders } from "@/hooks/use-pdv-purchase-orders";
import { formatCurrency, generateOrderMessage, openWhatsApp } from "@/lib/whatsapp-message";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";
import { ReceiveOrderDialog } from "./ReceiveOrderDialog";

interface PurchaseOrderCardProps {
  order: PurchaseOrder;
}

const statusConfig = {
  draft: {
    label: "Rascunho",
    icon: Clock,
    variant: "secondary" as const,
  },
  sent: {
    label: "Enviado",
    icon: Send,
    variant: "default" as const,
  },
  confirmed: {
    label: "Confirmado",
    icon: CheckCircle,
    variant: "outline" as const,
  },
  partial: {
    label: "Parcial",
    icon: Package,
    variant: "secondary" as const,
  },
  received: {
    label: "Recebido",
    icon: Truck,
    variant: "outline" as const,
  },
  cancelled: {
    label: "Cancelado",
    icon: XCircle,
    variant: "destructive" as const,
  },
};

export function PurchaseOrderCard({ order }: PurchaseOrderCardProps) {
  const { updateStatus, markAsSent, deleteOrder } = usePDVPurchaseOrders();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const status = statusConfig[order.status];
  const StatusIcon = status.icon;

  // Pedido pode receber mercadoria enquanto não estiver totalmente recebido
  const canReceive = ["draft", "sent", "confirmed", "partial"].includes(order.status);

  const handleSendWhatsApp = () => {
    if (!order.supplier?.phone) {
      return;
    }

    const message = generateOrderMessage(
      {
        orderNumber: order.order_number,
        total: order.total,
        expectedDelivery: order.expected_delivery ? new Date(order.expected_delivery) : undefined,
      },
      order.items?.map((item) => ({
        ingredientName: item.ingredient?.name || "",
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unit_price,
      })) || []
    );

    openWhatsApp(order.supplier.phone, message);
    
    // Mark as sent after opening WhatsApp
    if (order.status === "draft") {
      markAsSent.mutate(order.id);
    }
  };

  const handleDelete = () => {
    deleteOrder.mutate(order.id);
    setDeleteOpen(false);
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{order.order_number}</span>
                <Badge variant={status.variant}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {status.label}
                </Badge>
                {/* "Recebido" sozinho esconderia que faltou mercadoria. */}
                {order.closed_incomplete && (
                  <Badge
                    variant="outline"
                    className="border-amber-400 text-amber-700"
                    title={order.closure_reason || undefined}
                  >
                    Encerrado incompleto
                  </Badge>
                )}
              </div>
              {order.closed_incomplete && order.closure_reason && (
                <p className="mb-1 text-xs text-amber-700">
                  Motivo: {order.closure_reason}
                </p>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {format(new Date(order.order_date), "dd/MM/yyyy", { locale: ptBR })}
                {order.supplier && (
                  <>
                    <span className="mx-1">•</span>
                    <span>{order.supplier.name}</span>
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
                {canReceive && (
                  <DropdownMenuItem
                    onClick={() => deferMenuAction(() => setReceiveOpen(true))}
                  >
                    <PackageCheck className="h-4 w-4 mr-2" />
                    Receber pedido
                  </DropdownMenuItem>
                )}
                {order.status === "sent" && (
                  <DropdownMenuItem
                    onClick={() =>
                      updateStatus.mutate({ id: order.id, status: "confirmed" })
                    }
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Fornecedor confirmou o pedido
                  </DropdownMenuItem>
                )}
                {order.status !== "cancelled" && order.status !== "received" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        updateStatus.mutate({ id: order.id, status: "cancelled" })
                      }
                      className="text-destructive"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancelar Pedido
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => deferMenuAction(() => setDeleteOpen(true))}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Items summary */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Itens:</p>
            <div className="flex flex-wrap gap-1">
              {order.items?.slice(0, 3).map((item) => (
                <Badge key={item.id} variant="outline" className="text-xs">
                  {item.ingredient?.name} ({item.quantity} {item.unit})
                </Badge>
              ))}
              {(order.items?.length || 0) > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{(order.items?.length || 0) - 3} mais
                </Badge>
              )}
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total:</span>
            <span className="text-lg font-bold">{formatCurrency(order.total)}</span>
          </div>

          {/* Expected delivery */}
          {order.expected_delivery && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Entrega prevista:</span>
              <span>{format(new Date(order.expected_delivery), "dd/MM/yyyy", { locale: ptBR })}</span>
            </div>
          )}

          {/* Actions */}
          {order.status === "draft" && order.supplier?.phone && (
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={handleSendWhatsApp}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Enviar via WhatsApp
            </Button>
          )}

          {canReceive && (
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={() => setReceiveOpen(true)}
            >
              <PackageCheck className="h-4 w-4 mr-2" />
              {order.status === "partial"
                ? "Receber o que faltou"
                : "Receber pedido"}
            </Button>
          )}
        </CardContent>
      </Card>

      <ReceiveOrderDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        order={order}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O pedido {order.order_number} será
              permanentemente excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
