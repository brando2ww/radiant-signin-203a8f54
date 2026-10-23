import {
  type DeliveryOrder,
  useCancelOrder,
  useMarketplaceCancellationReasons,
} from "@/hooks/use-delivery-orders";
import { CancelOrderDialog } from "@/components/pdv/cashier/CancelOrderDialog";
import { isMarketplace, SOURCE_LABEL, type OrderSource } from "@/lib/marketplace-orders";

interface CancelDeliveryOrderDialogProps {
  order: DeliveryOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que o cancelamento foi aceito (fecha telas de cima, etc.). */
  onCancelled?: () => void;
}

/**
 * Cancelamento de pedido de delivery com motivo, o mesmo nas duas telas que
 * cancelam: o detalhe do pedido (kanban) e a fila de Delivery do Caixa.
 *
 * Pedido próprio vira "cancelado" no banco. Pedido de marketplace segue para a
 * plataforma com um motivo da lista dela (o iFood recusa texto livre), e só
 * sai da fila quando o evento de cancelamento volta. Quem decide isso é o
 * `useCancelOrder`; aqui fica só a ligação com a tela.
 */
export function CancelDeliveryOrderDialog({
  order,
  open,
  onOpenChange,
  onCancelled,
}: CancelDeliveryOrderDialogProps) {
  const cancelOrder = useCancelOrder();
  // `source` existe na tabela mas não no tipo DeliveryOrder (sem ele = "own")
  const source = (order as (DeliveryOrder & { source?: string | null }) | null)?.source;
  const marketplace = isMarketplace(source);

  // Só busca quando o diálogo abre: a lista do iFood varia com o estágio do
  // pedido, então uma lista cacheada de minutos atrás pode ser recusada.
  const { data: platformReasons, isLoading: loadingPlatformReasons } =
    useMarketplaceCancellationReasons(open ? order?.id ?? null : null, source);

  return (
    <CancelOrderDialog
      open={open}
      onOpenChange={onOpenChange}
      resourceLabel="Pedido"
      isLoading={cancelOrder.isPending}
      platformLabel={
        marketplace ? SOURCE_LABEL[(source ?? "own") as OrderSource] : undefined
      }
      platformReasons={platformReasons}
      loadingPlatformReasons={loadingPlatformReasons}
      summary={
        order
          ? {
              reference: `Pedido #${order.order_number}`,
              title: order.customer_name,
              itemsCount: order.delivery_order_items?.reduce(
                (s, i) => s + (i.quantity || 0),
                0,
              ),
              total: Number(order.total),
            }
          : null
      }
      onConfirm={async ({ reason, category, customerNotified, cancellationCode }) => {
        if (!order) return;
        try {
          await cancelOrder.mutateAsync({
            id: order.id,
            reason,
            category,
            customerNotified,
            cancellationCode,
          });
        } catch {
          // o toast de erro sai da mutation; o diálogo fica aberto para tentar de novo
          return;
        }
        onOpenChange(false);
        onCancelled?.();
      }}
    />
  );
}
