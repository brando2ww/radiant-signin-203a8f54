import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CartItem } from "@/pages/PublicMenu";
import { DeliveryCustomer, useCreateOrder } from "@/hooks/use-delivery-customers";
import { ChevronLeft, Loader2, MapPin, CreditCard, Clock, Star } from "lucide-react";
import { trackFunnelEvent } from "@/hooks/use-delivery-funnel";
import { useEarnPoints, useLoyaltySettings, useCustomerPoints, useLoyaltyPrizes, useRedeemPoints } from "@/hooks/use-delivery-loyalty";
import { LoyaltyBanner } from "@/components/public-menu/LoyaltyBanner";
import { LoyaltyRedeemSheet } from "@/components/public-menu/LoyaltyRedeemSheet";
import { useState } from "react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { isStoreCurrentlyOpen } from "@/lib/delivery-hours";
import { usePublicSettings } from "@/hooks/use-public-menu";

interface OrderConfirmationProps {
  userId: string;
  customer: DeliveryCustomer;
  cart: CartItem[];
  orderType: "delivery" | "pickup";
  addressText: string;
  paymentMethod: string;
  changeFor?: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  couponCode?: string;
  total: number;
  notes: string;
  onNotesChange: (notes: string) => void;
  onConfirm: (orderId: string) => void;
  onBack: () => void;
  selectedAddressId: string | null;
}

const paymentLabels: Record<string, string> = {
  pix: "PIX",
  credit: "Cartão de Crédito",
  debit: "Cartão de Débito",
  cash: "Dinheiro",
};

export const OrderConfirmation = ({
  userId,
  customer,
  cart,
  orderType,
  addressText,
  paymentMethod,
  changeFor,
  subtotal,
  deliveryFee,
  discount,
  couponCode,
  total,
  notes,
  onNotesChange,
  onConfirm,
  onBack,
  selectedAddressId,
}: OrderConfirmationProps) => {
  const createOrder = useCreateOrder();
  const earnPoints = useEarnPoints();
  const redeemPoints = useRedeemPoints();
  const { data: loyaltySettings } = useLoyaltySettings(userId);
  const { data: customerPoints = 0 } = useCustomerPoints(userId, customer.id);
  const { data: prizes = [] } = useLoyaltyPrizes(userId);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [redeemedPointsAmount, setRedeemedPointsAmount] = useState(0);

  const loyaltyActive = loyaltySettings?.is_active ?? false;
  const activePrizes = prizes.filter((p: any) => p.is_active && (!p.max_quantity || p.redeemed_count < p.max_quantity));

  const effectiveTotal = (orderType === "delivery" ? total : subtotal - discount) - loyaltyDiscount;

  const handleCashbackRedeem = (pointsToUse: number) => {
    if (!loyaltySettings) return;
    const discountValue = pointsToUse * Number(loyaltySettings.cashback_value_per_point);
    setLoyaltyDiscount(discountValue);
    setRedeemedPointsAmount(pointsToUse);
    toast.success(`Cashback de ${formatBRL(discountValue)} aplicado!`);
  };

  const handlePrizeRedeem = (prize: any) => {
    redeemPoints.mutate({
      user_id: userId,
      customer_id: customer.id,
      points: prize.points_cost,
      reference_id: prize.id,
      description: `Resgate: ${prize.name}`,
    });
    toast.success(`Prêmio "${prize.name}" resgatado!`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const orderData = {
      userId,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      addressId: selectedAddressId || undefined,
      addressText: orderType === "delivery" ? addressText : undefined,
      orderType,
      subtotal,
      deliveryFee: orderType === "delivery" ? deliveryFee : 0,
      discount: discount + loyaltyDiscount,
      couponCode,
      total: Math.max(0, effectiveTotal),
      paymentMethod,
      changeFor,
      notes,
      items: cart.map((item) => ({
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal:
          (item.unitPrice +
            item.selectedOptions.reduce((s, o) => s + o.priceAdjustment, 0)) *
          item.quantity,
        notes: item.notes,
        options: item.selectedOptions.map((o) => ({
          optionName: o.optionName,
          itemName: o.itemName,
          itemId: o.itemId,
          priceAdjustment: o.priceAdjustment,
        })),
      })),
    };

    createOrder.mutate(orderData, {
      onSuccess: (order) => {
        trackFunnelEvent(userId, "purchase", { orderId: order.id, total: effectiveTotal });

        // Earn loyalty points
        if (loyaltyActive && loyaltySettings) {
          const pointsEarned = Math.floor(effectiveTotal * Number(loyaltySettings.points_per_real));
          if (pointsEarned > 0) {
            earnPoints.mutate({
              user_id: userId,
              customer_id: customer.id,
              points: pointsEarned,
              reference_id: order.id,
              description: `Pedido #${order.order_number || order.id.slice(0, 8)}`,
            });
          }
        }

        // Deduct redeemed cashback points
        if (redeemedPointsAmount > 0) {
          redeemPoints.mutate({
            user_id: userId,
            customer_id: customer.id,
            points: redeemedPointsAmount,
            reference_id: order.id,
            description: `Cashback no pedido #${order.order_number || order.id.slice(0, 8)}`,
          });
        }

        onConfirm(order.id);
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {/* Loyalty Banner */}
        {loyaltyActive && customerPoints > 0 && loyaltySettings && (
          <div className="space-y-2">
            <LoyaltyBanner points={customerPoints} cashbackPerPoint={Number(loyaltySettings.cashback_value_per_point)} />
            <LoyaltyRedeemSheet
              points={customerPoints}
              minPointsRedeem={loyaltySettings.min_points_redeem}
              cashbackPerPoint={Number(loyaltySettings.cashback_value_per_point)}
              prizes={activePrizes}
              onRedeemCashback={handleCashbackRedeem}
              onRedeemPrize={handlePrizeRedeem}
            />
          </div>
        )}

        {/* Loyalty earning info */}
        {loyaltyActive && loyaltySettings && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Star className="h-3 w-3 text-primary" />
            <span>Você ganhará <strong>{Math.floor(effectiveTotal * Number(loyaltySettings.points_per_real))}</strong> pontos com este pedido!</span>
          </div>
        )}

        {/* Address */}
        {orderType === "delivery" && addressText && (
          <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
            <MapPin className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">Endereço de Entrega</p>
              <p className="text-sm text-muted-foreground">{addressText}</p>
            </div>
          </div>
        )}

        {orderType === "pickup" && (
          <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
            <MapPin className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">Retirada no Local</p>
              <p className="text-sm text-muted-foreground">
                Você irá retirar o pedido no estabelecimento
              </p>
            </div>
          </div>
        )}

        {/* Payment */}
        <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
          <CreditCard className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">Forma de Pagamento</p>
            <p className="text-sm text-muted-foreground">
              {paymentLabels[paymentMethod] || paymentMethod}
            </p>
            {changeFor && (
              <p className="text-sm text-muted-foreground">
                Troco para: {formatBRL(changeFor)}
              </p>
            )}
          </div>
        </div>

        {/* Estimated Time */}
        <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
          <Clock className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">Tempo Estimado</p>
            <p className="text-sm text-muted-foreground">35-45 minutos</p>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2">
          <h3 className="font-semibold">Itens do Pedido</h3>
          {cart.map((item, index) => {
            const itemPrice =
              item.unitPrice +
              item.selectedOptions.reduce((s, o) => s + o.priceAdjustment, 0);

            return (
              <div key={index} className="text-sm">
                <div className="flex justify-between">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-medium">
                    {formatBRL(itemPrice * item.quantity)}
                  </span>
                </div>
                {item.selectedOptions.length > 0 && (
                  <div className="text-xs text-muted-foreground pl-4 space-y-0.5">
                    {item.selectedOptions.map((opt, i) => (
                      <div key={i}>
                        • {opt.itemName}
                        {opt.priceAdjustment !== 0 &&
                          ` (+${formatBRL(opt.priceAdjustment)})`}
                      </div>
                    ))}
                  </div>
                )}
                {item.notes && (
                  <p className="text-xs text-muted-foreground pl-4">
                    Obs: {item.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <Separator />

        {/* Totals */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatBRL(subtotal)}</span>
          </div>
          {orderType === "delivery" && (
            <div className="flex justify-between">
              <span>Taxa de entrega:</span>
              <span>{formatBRL(deliveryFee)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Desconto {couponCode && `(${couponCode})`}:</span>
              <span>-{formatBRL(discount)}</span>
            </div>
          )}
          {loyaltyDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Cashback (pontos):</span>
              <span>-{formatBRL(loyaltyDiscount)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>Total:</span>
            <span>{formatBRL(Math.max(0, effectiveTotal))}</span>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Observações (opcional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Alguma observação sobre o pedido?"
            rows={3}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Button type="submit" className="flex-1" disabled={createOrder.isPending}>
          {createOrder.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          Confirmar Pedido
        </Button>
      </div>
    </form>
  );
};
