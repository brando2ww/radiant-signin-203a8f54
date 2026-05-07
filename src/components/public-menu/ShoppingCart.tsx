import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingBag, Trash2, Plus, Minus, Tag, X } from "lucide-react";
import { CartItem } from "@/pages/PublicMenu";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePublicSettings } from "@/hooks/use-public-menu";
import { useValidateCoupon, computeCouponDiscount, type DeliveryCoupon } from "@/hooks/use-delivery-coupons";
import { CheckoutFlow } from "./CheckoutFlow";
import { useMarketingTracking } from "@/hooks/use-marketing-tracking";
import { formatBRL } from "@/lib/format";
import { isStoreCurrentlyOpen } from "@/lib/delivery-hours";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface ShoppingCartProps {
  cart: CartItem[];
  onRemoveItem: (index: number) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onClearCart: () => void;
  userId: string;
  initialCoupon?: string;
}

export const ShoppingCart = ({
  cart,
  onRemoveItem,
  onUpdateQuantity,
  onClearCart,
  userId,
  initialCoupon,
}: ShoppingCartProps) => {
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<DeliveryCoupon | null>(null);
  const couponAutoApplied = useRef(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const { data: settings } = usePublicSettings(userId);
  const validateCoupon = useValidateCoupon();
  const { trackBeginCheckout } = useMarketingTracking();

  const subtotal = cart.reduce((sum, item) => {
    const itemTotal = item.unitPrice + item.selectedOptions.reduce((s, opt) => s + opt.priceAdjustment * (opt.quantity ?? 1), 0);
    return sum + itemTotal * item.quantity;
  }, 0);

  const deliveryFee = Number(settings?.default_delivery_fee || 0);
  // Recalcula o desconto em tempo real sobre o subtotal atual.
  // Se o subtotal cair abaixo do mínimo, o cupom é removido automaticamente.
  const discount = appliedCoupon ? computeCouponDiscount(appliedCoupon, subtotal) : 0;
  const total = subtotal + deliveryFee - discount;
  const storeStatus = isStoreCurrentlyOpen(settings);

  // Remove cupom automaticamente se o pedido cair abaixo do mínimo
  useEffect(() => {
    if (appliedCoupon && subtotal > 0 && subtotal < appliedCoupon.min_order_value) {
      setAppliedCoupon(null);
      toast.info(
        `Cupom ${appliedCoupon.code} removido: pedido ficou abaixo do mínimo de ${formatBRL(appliedCoupon.min_order_value)}`
      );
    }
  }, [subtotal, appliedCoupon]);

  // Auto-apply coupon from URL when cart has items
  useEffect(() => {
    if (initialCoupon && cart.length > 0 && !appliedCoupon && !couponAutoApplied.current) {
      couponAutoApplied.current = true;
      validateCoupon.mutate(
        { code: initialCoupon, orderValue: subtotal, userId },
        {
          onSuccess: (data) => {
            setAppliedCoupon(data.coupon);
            toast.success(`Cupom ${initialCoupon} aplicado automaticamente!`);
          },
          onError: () => {
            toast.error("Cupom do link não pôde ser aplicado");
          },
        }
      );
    }
  }, [initialCoupon, cart.length, appliedCoupon, subtotal]);

  const handleApplyCoupon = () => {
    validateCoupon.mutate(
      { code: couponCode, orderValue: subtotal, userId },
      {
        onSuccess: (data) => {
          setAppliedCoupon({
            code: couponCode,
            discount: data.discount,
          });
          setCouponCode("");
        },
      }
    );
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleOrderComplete = () => {
    onClearCart();
    setAppliedCoupon(null);
  };

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-4 right-4 z-50 shadow-lg h-14 px-6"
          disabled={cart.length === 0}
        >
          <ShoppingBag className="h-5 w-5 mr-2" />
          Ver Carrinho
          {totalItems > 0 && (
            <Badge className="ml-2" variant="secondary">
              {totalItems}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="flex items-center justify-between">
            <span>Seu Pedido</span>
            {cart.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearCart}
                className="text-destructive"
              >
                Limpar
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <ShoppingBag className="h-16 w-16 mb-4 opacity-20" />
            <p>Seu carrinho está vazio</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 px-6">
              <div className="space-y-4 py-4">
                {cart.map((item, index) => {
                  const itemPrice = item.unitPrice + item.selectedOptions.reduce((s, opt) => s + opt.priceAdjustment * (opt.quantity ?? 1), 0);
                  
                  return (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h4 className="font-semibold">{item.name}</h4>
                            {item.selectedOptions.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                {item.selectedOptions.map((opt, i) => {
                                  const q = opt.quantity ?? 1;
                                  const sub = opt.priceAdjustment * q;
                                  return (
                                    <div key={i}>
                                      • {q > 1 ? `${q}× ` : ""}{opt.itemName}
                                      {sub !== 0 && ` (+${formatBRL(sub)})`}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {item.notes && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Obs: {item.notes}
                              </p>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => onRemoveItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="font-semibold">
                            {formatBRL(itemPrice * item.quantity)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="border-t p-6 space-y-4">
              {/* Coupon */}
              <div className="space-y-2">
                {!appliedCoupon ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Código do cupom"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleApplyCoupon}
                      disabled={!couponCode || validateCoupon.isPending}
                      variant="outline"
                    >
                      <Tag className="h-4 w-4 mr-2" />
                      Aplicar
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-md">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">
                        {appliedCoupon.code}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={handleRemoveCoupon}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatBRL(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Taxa de entrega:</span>
                  <span>{formatBRL(deliveryFee)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Desconto:</span>
                    <span>-{formatBRL(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Total:</span>
                  <span>{formatBRL(total)}</span>
                </div>
              </div>

              {!storeStatus.open && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Loja fechada no momento.
                  {storeStatus.nextOpenLabel && <> Abre {storeStatus.nextOpenLabel}.</>}
                </div>
              )}
              <Button
                size="lg"
                className="w-full"
                disabled={!storeStatus.open}
                onClick={() => {
                  if (!storeStatus.open) {
                    toast.error("Loja fechada — não é possível finalizar pedidos agora.");
                    return;
                  }
                  setIsCheckoutOpen(true);
                  trackBeginCheckout(cart, total);
                }}
              >
                {storeStatus.open ? "Finalizar Pedido" : "Loja fechada"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>

    <CheckoutFlow
      open={isCheckoutOpen}
      onOpenChange={setIsCheckoutOpen}
      cart={cart}
      subtotal={subtotal}
      deliveryFee={deliveryFee}
      discount={discount}
      couponCode={appliedCoupon?.code}
      total={total}
      userId={userId}
      onOrderComplete={handleOrderComplete}
    />
    </>
  );
};
