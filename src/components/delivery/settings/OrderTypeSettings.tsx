import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Home, Truck } from "lucide-react";
import { toast } from "sonner";
import { useCreateOrUpdateSettings, useDeliverySettings } from "@/hooks/use-delivery-settings";

/**
 * Como o cliente do cardápio online recebe o pedido: entrega, retirada no
 * local ou as duas. O que fica desligado some do checkout, e o banco recusa
 * pedido do cardápio com a opção desligada (trava delivery_orders_guard_order_type).
 */
export const OrderTypeSettings = () => {
  const { data: settings } = useDeliverySettings();
  const updateSettings = useCreateOrUpdateSettings();

  const entrega = settings?.accepts_delivery ?? true;
  const retirada = settings?.accepts_pickup ?? true;

  const alternar = (campo: "accepts_delivery" | "accepts_pickup", valor: boolean) => {
    const outra = campo === "accepts_delivery" ? retirada : entrega;
    if (!valor && !outra) {
      toast.error("Deixe pelo menos uma forma ligada, senão o cliente não consegue fechar o pedido.");
      return;
    }
    updateSettings.mutate({ [campo]: valor });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Como o cliente recebe o pedido</CardTitle>
        <CardDescription>
          Vale para o cardápio online. O que estiver desligado não aparece no
          fechamento do pedido.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Truck className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <Label htmlFor="acceptsDelivery" className="text-sm font-medium">Entrega</Label>
              <p className="text-xs text-muted-foreground">O pedido vai até o endereço do cliente.</p>
            </div>
          </div>
          <Switch
            id="acceptsDelivery"
            checked={entrega}
            disabled={updateSettings.isPending}
            onCheckedChange={(v) => alternar("accepts_delivery", v)}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Home className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <Label htmlFor="acceptsPickup" className="text-sm font-medium">Retirada no local</Label>
              <p className="text-xs text-muted-foreground">O cliente busca o pedido no estabelecimento.</p>
            </div>
          </div>
          <Switch
            id="acceptsPickup"
            checked={retirada}
            disabled={updateSettings.isPending}
            onCheckedChange={(v) => alternar("accepts_pickup", v)}
          />
        </div>
      </CardContent>
    </Card>
  );
};
