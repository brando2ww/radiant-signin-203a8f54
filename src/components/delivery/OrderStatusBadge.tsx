import { Badge } from "@/components/ui/badge";
import { DeliveryOrder } from "@/hooks/use-delivery-orders";

interface OrderStatusBadgeProps {
  status: DeliveryOrder["status"];
  orderType?: DeliveryOrder["order_type"];
}

const statusConfig = {
  pending: {
    label: "Novo",
    variant: "default" as const,
    className: "bg-yellow-500 hover:bg-yellow-600",
  },
  confirmed: {
    label: "Confirmado",
    variant: "default" as const,
    className: "bg-blue-500 hover:bg-blue-600",
  },
  preparing: {
    label: "Preparando",
    variant: "default" as const,
    className: "bg-orange-500 hover:bg-orange-600",
  },
  ready: {
    label: "Pronto",
    variant: "default" as const,
    className: "bg-purple-500 hover:bg-purple-600",
  },
  delivering: {
    label: "Em Entrega",
    variant: "default" as const,
    className: "bg-indigo-500 hover:bg-indigo-600",
  },
  completed: {
    label: "Concluído",
    variant: "default" as const,
    className: "bg-green-500 hover:bg-green-600",
  },
  cancelled: {
    label: "Cancelado",
    variant: "destructive" as const,
    className: "",
  },
};

export const OrderStatusBadge = ({ status, orderType }: OrderStatusBadgeProps) => {
  // Retirada em "delivering" foi liberada para o cliente buscar.
  const config =
    orderType === "pickup" && status === "delivering"
      ? { ...statusConfig.ready, label: "Pronto para retirar" }
      : statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
};
