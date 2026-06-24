import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Wifi, WifiOff } from "lucide-react";
import { useDeliveryMuchIntegration } from "@/hooks/use-deliverymuch-integration";
import { Skeleton } from "@/components/ui/skeleton";

export function DeliveryMuchIntegrationCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deliveryMin, setDeliveryMin] = useState<number | "">("");
  const [pickupMin, setPickupMin] = useState<number | "">("");

  const {
    settings,
    isLoading,
    isConnected,
    connect,
    disconnect,
    toggleOnline,
    setDeliveryTime,
    updateSettings,
  } = useDeliveryMuchIntegration();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    connect.mutate({ email, password });
  };

  const handleSetDeliveryTime = () => {
    const dMin = Number(deliveryMin || settings?.deliverymuch_delivery_time_min ?? 40);
    const pMin = Number(pickupMin || settings?.deliverymuch_pickup_time_min ?? 20);
    setDeliveryTime.mutate({ delivery_min: dMin, pickup_min: pMin });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              DeliveryMuch
              {isConnected ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="secondary">Desconectado</Badge>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Gerencie pedidos DeliveryMuch diretamente no seu PDV
            </p>
          </div>
          {isConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? "Desconectando..." : "Desconectar"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Not connected: login form ── */}
        {!isConnected && (
          <form onSubmit={handleConnect} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Insira as credenciais do seu restaurante no DeliveryMuch (as mesmas do app Eugênio).
            </p>
            <div className="space-y-2">
              <Label htmlFor="dm-email">E-mail do restaurante</Label>
              <Input
                id="dm-email"
                type="email"
                placeholder="restaurante@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dm-password">Senha</Label>
              <Input
                id="dm-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={connect.isPending}>
              {connect.isPending ? "Conectando..." : "Conectar"}
            </Button>
          </form>
        )}

        {/* ── Connected: status + controls ── */}
        {isConnected && (
          <>
            {/* Info box */}
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              {settings?.deliverymuch_email && (
                <p className="text-xs text-muted-foreground">
                  Conta: <span className="font-medium text-foreground">{settings.deliverymuch_email}</span>
                </p>
              )}
              {settings?.deliverymuch_restaurant_uuid && (
                <p className="text-xs text-muted-foreground">
                  UUID do restaurante:{" "}
                  <span className="font-mono text-xs">{settings.deliverymuch_restaurant_uuid}</span>
                </p>
              )}
              {settings?.deliverymuch_token_expires_at && (
                <p className="text-xs text-muted-foreground">
                  Token expira em:{" "}
                  {new Date(settings.deliverymuch_token_expires_at).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>

            {/* Online/offline toggle */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => toggleOnline.mutate(true)}
                disabled={toggleOnline.isPending}
              >
                <Wifi className="h-4 w-4 text-emerald-500" />
                Abrir loja
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => toggleOnline.mutate(false)}
                disabled={toggleOnline.isPending}
              >
                <WifiOff className="h-4 w-4 text-muted-foreground" />
                Fechar loja
              </Button>
            </div>

            {/* Settings */}
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="dm-auto-accept" className="text-sm">
                  Aceitar pedidos automaticamente
                </Label>
                <Switch
                  id="dm-auto-accept"
                  checked={settings?.deliverymuch_auto_accept ?? false}
                  onCheckedChange={(checked) =>
                    updateSettings.mutate({ deliverymuch_auto_accept: checked })
                  }
                />
              </div>
            </div>

            {/* Delivery time */}
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Tempos de entrega (minutos)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="dm-delivery-min" className="text-xs text-muted-foreground">
                    Entrega
                  </Label>
                  <Input
                    id="dm-delivery-min"
                    type="number"
                    min={1}
                    max={120}
                    placeholder={String(settings?.deliverymuch_delivery_time_min ?? 40)}
                    value={deliveryMin}
                    onChange={(e) => setDeliveryMin(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dm-pickup-min" className="text-xs text-muted-foreground">
                    Retirada
                  </Label>
                  <Input
                    id="dm-pickup-min"
                    type="number"
                    min={1}
                    max={120}
                    placeholder={String(settings?.deliverymuch_pickup_time_min ?? 20)}
                    value={pickupMin}
                    onChange={(e) => setPickupMin(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-1"
                onClick={handleSetDeliveryTime}
                disabled={setDeliveryTime.isPending}
              >
                {setDeliveryTime.isPending ? "Salvando..." : "Atualizar tempos"}
              </Button>
            </div>
          </>
        )}

        <div className="text-xs text-muted-foreground space-y-0.5 border-t pt-3">
          <p>• Aceite automático e controle de status de pedidos</p>
          <p>• Abrir e fechar loja na plataforma</p>
          <p>• Ajuste de tempo de entrega em tempo real</p>
        </div>
      </CardContent>
    </Card>
  );
}
