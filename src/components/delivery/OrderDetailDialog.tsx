import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DeliveryOrder,
  useUpdateOrderStatus,
  useCancelOrder,
  useMarketplaceCancellationReasons,
  useReprintOrder,
} from "@/hooks/use-delivery-orders";
import {
  Phone,
  MapPin,
  Clock,
  Package,
  CreditCard,
  MessageCircle,
  XCircle,
  CheckCircle,
  ChevronRight,
  Printer,
  FileText,
  Receipt,
} from "lucide-react";
import { printMotoboyReceipt } from "@/lib/print-motoboy-receipt";
import { useOrderNfce } from "@/hooks/use-order-nfce";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { OrderSourceBadge } from "./OrderSourceBadge";
import { useState } from "react";
import { formatBRL } from "@/lib/format";
import { CancelOrderDialog } from "@/components/pdv/cashier/CancelOrderDialog";
import { getCancelCategoryLabel } from "@/lib/cancel-reasons";
import { isMarketplace, SOURCE_LABEL, nextOrderStep, type OrderSource } from "@/lib/marketplace-orders";

interface OrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: DeliveryOrder;
}

export const OrderDetailDialog = ({
  open,
  onOpenChange,
  order,
}: OrderDetailDialogProps) => {
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const updateStatus = useUpdateOrderStatus();
  const cancelOrder = useCancelOrder();
  // Só busca quando o diálogo abre: a lista do iFood varia com o estágio do
  // pedido, então uma lista cacheada de minutos atrás pode ser recusada.
  const { data: platformReasons, isLoading: loadingPlatformReasons } =
    useMarketplaceCancellationReasons(
      isCancelDialogOpen ? order?.id ?? null : null,
      (order as any)?.source,
    );
  const reprintOrder = useReprintOrder();
  const { data: nfce } = useOrderNfce(order.status === "completed" ? order.id : null);

  const canReprint = !["pending", "cancelled"].includes(order.status);

  // O próximo passo respeita o vocabulário da origem: no iFood, pedido de
  // entrega pula "pronto" e vai direto ao despacho, e quem conclui é a
  // plataforma.
  const nextStep = nextOrderStep((order as any).source, order.status, order.order_type);

  const handleNextStatus = () => {
    if (nextStep) {
      updateStatus.mutate({ id: order.id, status: nextStep.status as any });
    }
  };

  const handleWhatsApp = () => {
    const phone = order.customer_phone.replace(/\D/g, "");
    const message = `Olá ${order.customer_name}! Sobre seu pedido ${order.order_number}...`;
    window.open(
      `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
  };

  const canAdvanceStatus =
    !!nextStep && order.status !== "completed" && order.status !== "cancelled";
  const canCancel =
    order.status !== "completed" && order.status !== "cancelled";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                Pedido {order.order_number}
                <OrderSourceBadge source={(order as any).source} size="md" />
              </span>
              <OrderStatusBadge status={order.status} />
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Customer Info */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" />
                Informações do Cliente
              </h3>
              <div className="space-y-1 text-sm">
                <p>
                  <strong>Nome:</strong> {order.customer_name}
                </p>
                <div className="flex items-center gap-2">
                  <strong>Telefone:</strong> {order.customer_phone}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6"
                    onClick={handleWhatsApp}
                  >
                    <MessageCircle className="h-3 w-3 mr-1" />
                    WhatsApp
                  </Button>
                </div>
                <p>
                  <strong>Tipo:</strong>{" "}
                  <Badge variant={order.order_type === "delivery" ? "default" : "secondary"}>
                    {order.order_type === "delivery" ? "Delivery" : "Retirada"}
                  </Badge>
                </p>
                {order.delivery_address_text && (
                  <div>
                    <strong>Endereço:</strong>
                    <p className="text-muted-foreground">
                      {order.delivery_address_text}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div className="space-y-2">
              <h3 className="font-semibold">Itens do Pedido</h3>
              <div className="space-y-2">
                {order.delivery_order_items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between text-sm p-2 rounded bg-muted/50"
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {item.quantity}x {item.product_name}
                      </p>
                      {item.delivery_order_item_options &&
                        item.delivery_order_item_options.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            {item.delivery_order_item_options.map((opt) => (
                              <div key={opt.id}>
                                • {opt.option_name}: {opt.item_name}
                                {opt.price_adjustment !== 0 && (
                                  <span>
                                    {" "}
                                    ({opt.price_adjustment > 0 ? "+" : ""}{formatBRL(Number(opt.price_adjustment))})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Obs: {item.notes}
                        </p>
                      )}
                    </div>
                    <p className="font-semibold">
                      {formatBRL(Number(item.subtotal))}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Dados exigidos pela plataforma de origem.
                A homologação do iFood cobra na tela: data E hora do
                agendamento, código de coleta na retirada, documento do
                cliente e a observação de ENTREGA (que é diferente da
                observação do item). Estavam todos sendo gravados no banco e
                nenhum aparecia aqui. */}
            {isMarketplace((order as any).source) && (
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <OrderSourceBadge source={(order as any).source} size="md" />
                  Dados do pedido na plataforma
                </h3>
                <div className="space-y-1 text-sm">
                  {(order as any).external_code && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Nº na plataforma:</span>
                      <span className="font-medium text-foreground">
                        #{(order as any).external_code}
                      </span>
                    </div>
                  )}
                  {(order as any).order_timing && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tipo:</span>
                      <span>
                        {(order as any).order_timing === "SCHEDULED"
                          ? "Agendado"
                          : "Imediato"}
                      </span>
                    </div>
                  )}
                  {(order as any).scheduled_for && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Agendado para:</span>
                      <span className="font-medium text-foreground">
                        {format(new Date((order as any).scheduled_for), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {(order as any).scheduled_until && (
                          <> até {format(new Date((order as any).scheduled_until), "HH:mm", { locale: ptBR })}</>
                        )}
                      </span>
                    </div>
                  )}
                  {(order as any).external_collection_code && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Código de coleta:</span>
                      <span className="font-mono font-bold text-foreground tracking-wider">
                        {(order as any).external_collection_code}
                      </span>
                    </div>
                  )}
                  {(order as any).external_delivered_by && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Entrega por:</span>
                      <span>
                        {(order as any).external_delivered_by === "IFOOD"
                          ? "Entregador do iFood"
                          : "Entrega própria da loja"}
                      </span>
                    </div>
                  )}
                  {(order as any).customer_document && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>CPF/CNPJ do cliente:</span>
                      <span className="font-medium text-foreground">
                        {(order as any).customer_document}
                      </span>
                    </div>
                  )}
                  {(order as any).delivery_notes && (
                    <div className="pt-1">
                      <span className="text-muted-foreground">Observação da entrega:</span>
                      <p className="text-foreground">{(order as any).delivery_notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment & Total */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Pagamento
              </h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatBRL(Number(order.subtotal))}</span>
                </div>
                {order.delivery_fee > 0 && (
                  <div className="flex justify-between">
                    <span>Taxa de entrega:</span>
                    <span>{formatBRL(Number(order.delivery_fee))}</span>
                  </div>
                )}
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>
                      {order.discount_source === "loyalty_prize"
                        ? `Prêmio de fidelidade${order.loyalty_points_spent ? ` (${order.loyalty_points_spent} pts)` : ""}`
                        : `Desconto${order.coupon_code ? ` (${order.coupon_code})` : ""}`}:
                    </span>
                    <span>-{formatBRL(Number(order.discount))}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total:</span>
                  <span>{formatBRL(Number(order.total))}</span>
                </div>
                {/* Critério de homologação do iFood: o rateio do desconto tem
                    que aparecer, não só o valor — o lojista precisa saber
                    quanto do cupom ele está bancando. */}
                {(Number((order as any).discount_sponsor_ifood) > 0 ||
                  Number((order as any).discount_sponsor_merchant) > 0) && (
                  <div className="pl-3 space-y-0.5 text-xs text-muted-foreground">
                    {Number((order as any).discount_sponsor_ifood) > 0 && (
                      <div className="flex justify-between">
                        <span>Subsídio iFood:</span>
                        <span>{formatBRL(Number((order as any).discount_sponsor_ifood))}</span>
                      </div>
                    )}
                    {Number((order as any).discount_sponsor_merchant) > 0 && (
                      <div className="flex justify-between">
                        <span>Subsídio da loja:</span>
                        <span>{formatBRL(Number((order as any).discount_sponsor_merchant))}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Forma de pagamento:</span>
                  <span className="capitalize">
                    {order.payment_method}
                    {(order as any).external_payment_brand && (
                      <> · {(order as any).external_payment_brand}</>
                    )}
                    {(order as any).external_payment_type && (
                      <span className="ml-1 text-xs">
                        ({String((order as any).external_payment_type).toLowerCase() === "online"
                          ? "pago pelo app"
                          : "pagar na entrega"})
                      </span>
                    )}
                  </span>
                </div>
                {order.change_for && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Troco para:</span>
                    <span>{formatBRL(Number(order.change_for))}</span>
                  </div>
                )}
              </div>
            </div>

            {order.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold">Observações</h3>
                  <p className="text-sm text-muted-foreground">{order.notes}</p>
                </div>
              </>
            )}

            <Separator />

            {/* Timeline */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Histórico
              </h3>
              <div className="space-y-1 text-sm">
                <p>
                  Criado:{" "}
                  {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR,
                  })}
                </p>
                {order.confirmed_at && (
                  <p>
                    Confirmado:{" "}
                    {format(new Date(order.confirmed_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                )}
                {order.ready_at && (
                  <p>
                    Pronto:{" "}
                    {format(new Date(order.ready_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                )}
                {order.delivered_at && (
                  <p>
                    Entregue:{" "}
                    {format(new Date(order.delivered_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                )}
                {order.cancelled_at && (
                  <div className="text-destructive">
                    <p>
                      Cancelado:{" "}
                      {format(new Date(order.cancelled_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                    {order.cancellation_category && (
                      <p className="text-xs">
                        Categoria: {getCancelCategoryLabel(order.cancellation_category)}
                      </p>
                    )}
                    {order.cancellation_reason && (
                      <p className="text-xs">Motivo: {order.cancellation_reason}</p>
                    )}
                    <p className="text-xs">
                      Cliente informado: {order.customer_notified ? "Sim" : "Não"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Recibos — visível apenas para pedidos concluídos */}
            {order.status === "completed" && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Recibos
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => printMotoboyReceipt(order)}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Recibo não fiscal
                    </Button>
                    {nfce?.danfe_pdf_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(nfce.danfe_pdf_url!, "_blank")}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Cupom fiscal (NFC-e)
                      </Button>
                    )}
                    {nfce?.xml_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(nfce.xml_url!, "_blank")}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        XML da NFC-e
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            {(canAdvanceStatus || canReprint) && (
              <div className="flex flex-wrap gap-2 pt-4">
                {canAdvanceStatus && (
                  <Button
                    className="flex-1"
                    onClick={handleNextStatus}
                    disabled={updateStatus.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {nextStep?.label}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
                {canReprint && (
                  <Button
                    variant="outline"
                    onClick={() => reprintOrder.mutate({ orderId: order.id })}
                    disabled={reprintOrder.isPending}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Reimprimir
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="destructive"
                    onClick={() => setIsCancelDialogOpen(true)}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CancelOrderDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
        resourceLabel="Pedido"
        isLoading={cancelOrder.isPending}
        platformLabel={
          isMarketplace((order as any)?.source)
            ? SOURCE_LABEL[((order as any)?.source ?? "own") as OrderSource]
            : undefined
        }
        platformReasons={platformReasons}
        loadingPlatformReasons={loadingPlatformReasons}
        summary={{
          reference: `Pedido #${order.order_number}`,
          title: order.customer_name,
          itemsCount: order.delivery_order_items?.reduce(
            (s, i) => s + (i.quantity || 0),
            0,
          ),
          total: Number(order.total),
        }}
        onConfirm={async ({ reason, category, customerNotified, cancellationCode }) => {
          await cancelOrder.mutateAsync({
            id: order.id,
            reason,
            category,
            customerNotified,
            cancellationCode,
          });
          setIsCancelDialogOpen(false);
          setTimeout(() => onOpenChange(false), 0);
        }}
      />
    </>
  );
};
