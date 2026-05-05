import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Volume2, Mail, MessageSquare, Zap } from "lucide-react";
import { useDeliverySettings, useCreateOrUpdateSettings } from "@/hooks/use-delivery-settings";

interface NotificationPreferencesProps {
  soundEnabled: boolean;
  onSoundToggle: (enabled: boolean) => void;
  emailEnabled: boolean;
  onEmailToggle: (enabled: boolean) => void;
  whatsappEnabled: boolean;
  onWhatsappToggle: (enabled: boolean) => void;
}

export const NotificationPreferences = ({
  soundEnabled,
  onSoundToggle,
  emailEnabled,
  onEmailToggle,
  whatsappEnabled,
  onWhatsappToggle,
}: NotificationPreferencesProps) => {
  const { data: settings } = useDeliverySettings();
  const updateSettings = useCreateOrUpdateSettings();
  const autoAccept = settings?.auto_accept_orders ?? false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Confirmação Automática de Pedidos
          </CardTitle>
          <CardDescription>
            Quando ativada, novos pedidos do delivery são confirmados automaticamente,
            o estoque é baixado e a impressão é enviada para a cozinha sem ação manual
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-accept-orders" className="text-base">
                Aceitar Pedidos Automaticamente
              </Label>
              <p className="text-sm text-muted-foreground">
                Pedidos vão direto de "Pendente" para "Confirmado"
              </p>
            </div>
            <Switch
              id="auto-accept-orders"
              checked={autoAccept}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ auto_accept_orders: checked })
              }
              disabled={updateSettings.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Preferências de Notificações
          </CardTitle>
          <CardDescription>
            Configure como deseja receber notificações de novos pedidos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Volume2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="sound-notifications" className="text-base">
                  Alertas Sonoros
                </Label>
                <p className="text-sm text-muted-foreground">
                  Reproduzir som quando chegar novo pedido
                </p>
              </div>
            </div>
            <Switch
              id="sound-notifications"
              checked={soundEnabled}
              onCheckedChange={onSoundToggle}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="email-notifications" className="text-base">
                  Notificações por E-mail
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receber resumo diário de pedidos por e-mail
                </p>
              </div>
            </div>
            <Switch
              id="email-notifications"
              checked={emailEnabled}
              onCheckedChange={onEmailToggle}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="whatsapp-notifications" className="text-base">
                  Notificações WhatsApp
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enviar atualizações de pedidos via WhatsApp
                </p>
              </div>
            </div>
            <Switch
              id="whatsapp-notifications"
              checked={whatsappEnabled}
              onCheckedChange={onWhatsappToggle}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
