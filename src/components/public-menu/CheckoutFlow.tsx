import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomerIdentification } from "./checkout/CustomerIdentification";
import { CustomerData } from "./checkout/CustomerData";
import { DeliveryAddress } from "./checkout/DeliveryAddress";
import { PaymentMethod } from "./checkout/PaymentMethod";
import { OrderConfirmation } from "./checkout/OrderConfirmation";
import { OrderTrackingView } from "./checkout/OrderTrackingView";
import { CartItem } from "@/pages/PublicMenu";
import { DeliveryCustomer } from "@/hooks/use-delivery-customers";
import { useMarketingTracking } from "@/hooks/use-marketing-tracking";

interface CheckoutFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  couponCode?: string;
  total: number;
  userId: string;
  onOrderComplete: () => void;
}

export type CheckoutStep = "phone" | "customer-data" | "address" | "payment" | "confirmation" | "tracking";

export const CheckoutFlow = ({
  open,
  onOpenChange,
  cart,
  subtotal,
  deliveryFee,
  discount,
  couponCode,
  total,
  userId,
  onOrderComplete,
}: CheckoutFlowProps) => {
  const [currentStep, setCurrentStep] = useState<CheckoutStep>("phone");
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<DeliveryCustomer | null>(null);
  const [orderType, setOrderType] = useState<"delivery" | "pickup">("delivery");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressText, setAddressText] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [changeFor, setChangeFor] = useState<number | undefined>();
  const [notes, setNotes] = useState<string>("");
  const [resolvedDeliveryFee, setResolvedDeliveryFee] = useState<number | null>(null);
  const { trackPurchase } = useMarketingTracking();

  const effectiveDeliveryFee = orderType === "pickup" ? 0 : resolvedDeliveryFee ?? deliveryFee;
  const effectiveTotal = subtotal + effectiveDeliveryFee - discount;

  const handlePhoneConfirmed = (confirmedCustomer: DeliveryCustomer) => {
    setCustomer(confirmedCustomer);
    if (confirmedCustomer.name) {
      setCurrentStep("address");
    } else {
      setCurrentStep("customer-data");
    }
  };

  const handleCustomerDataConfirmed = () => {
    setCurrentStep("address");
  };

  const handleAddressConfirmed = (
    type: "delivery" | "pickup",
    addressId?: string,
    address?: string,
    fee?: number
  ) => {
    setOrderType(type);
    setSelectedAddressId(addressId || null);
    setAddressText(address || "");
    setResolvedDeliveryFee(type === "pickup" ? 0 : fee ?? null);
    setCurrentStep("payment");
  };

  const handlePaymentConfirmed = (method: string, change?: number) => {
    setPaymentMethod(method);
    setChangeFor(change);
    setCurrentStep("confirmation");
  };

  const handleOrderPlaced = (orderId: string) => {
    // Track purchase
    trackPurchase({
      orderId,
      total: effectiveTotal,
      subtotal,
      deliveryFee: effectiveDeliveryFee,
      discount,
      cart,
    });

    onOrderComplete();
    onOpenChange(false);
    // Reset
    setCurrentStep("phone");
    setCustomer(null);
    setOrderType("delivery");
    setSelectedAddressId(null);
    setAddressText("");
    setPaymentMethod("");
    setChangeFor(undefined);
    setNotes("");
    setResolvedDeliveryFee(null);
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case "phone":
        return "Identificação";
      case "customer-data":
        return "Seus Dados";
      case "address":
        return "Entrega";
      case "payment":
        return "Pagamento";
      case "confirmation":
        return "Confirmar Pedido";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
        </DialogHeader>

        {currentStep === "phone" && (
          <CustomerIdentification onConfirm={handlePhoneConfirmed} />
        )}

        {currentStep === "customer-data" && customer && (
          <CustomerData
            customer={customer}
            onConfirm={handleCustomerDataConfirmed}
            onBack={() => setCurrentStep("phone")}
          />
        )}

        {currentStep === "address" && customer && (
          <DeliveryAddress
            customerId={customer.id}
            userId={userId}
            onConfirm={handleAddressConfirmed}
            onBack={() => setCurrentStep(customer.name ? "phone" : "customer-data")}
          />
        )}

        {currentStep === "payment" && (
          <PaymentMethod
            userId={userId}
            total={effectiveTotal}
            onConfirm={handlePaymentConfirmed}
            onBack={() => setCurrentStep("address")}
          />
        )}

        {currentStep === "confirmation" && customer && (
          <OrderConfirmation
            userId={userId}
            customer={customer}
            cart={cart}
            orderType={orderType}
            addressText={addressText}
            paymentMethod={paymentMethod}
            changeFor={changeFor}
            subtotal={subtotal}
            deliveryFee={effectiveDeliveryFee}
            discount={discount}
            couponCode={couponCode}
            total={effectiveTotal}
            notes={notes}
            onNotesChange={setNotes}
            onConfirm={handleOrderPlaced}
            onBack={() => setCurrentStep("payment")}
            selectedAddressId={selectedAddressId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
