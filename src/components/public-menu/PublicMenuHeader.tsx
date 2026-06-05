import { useBusinessSettings, usePublicSettings } from "@/hooks/use-public-menu";
import { Clock, MapPin, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isStoreCurrentlyOpen, formatTodayShifts } from "@/lib/delivery-hours";
import { useNavigate } from "react-router-dom";
import { useLoyaltySettings } from "@/hooks/use-delivery-loyalty";

interface PublicMenuHeaderProps {
  userId: string;
  handle?: string;
}

export const PublicMenuHeader = ({ userId, handle }: PublicMenuHeaderProps) => {
  const { data: businessSettings } = useBusinessSettings(userId);
  const { data: deliverySettings } = usePublicSettings(userId);
  const { data: loyaltySettings } = useLoyaltySettings(userId);
  const navigate = useNavigate();

  const loyaltyActive = loyaltySettings?.is_active ?? false;
  const loyaltyPath = `/cardapio/${handle || userId}/meus-pontos`;

  return (
    <div className="border-b bg-card">
      {/* Cover Image */}
      {businessSettings?.cover_url && (
        <div className="h-40 w-full overflow-hidden">
          <img
            src={businessSettings.cover_url}
            alt="Capa"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <div className="container mx-auto px-4 py-6">
        <div className={`flex items-start gap-4 ${businessSettings?.cover_url ? '-mt-12 relative' : ''}`}>
          {businessSettings?.logo_url ? (
            <img
              src={businessSettings.logo_url}
              alt="Logo"
              className={`h-20 w-20 rounded-full object-cover border-4 border-background shadow-lg ${businessSettings?.cover_url ? 'ring-2 ring-white' : ''}`}
            />
          ) : (
            <div 
              className="h-20 w-20 rounded-full border-4 border-background shadow-lg flex items-center justify-center text-white font-bold text-2xl"
              style={{ backgroundColor: businessSettings?.primary_color || '#3b82f6' }}
            >
              {businessSettings?.business_name?.charAt(0) || "R"}
            </div>
          )}
          <div className={`flex-1 ${businessSettings?.cover_url ? 'pt-8' : ''}`}>
            <h1 className="text-2xl font-bold">
              {businessSettings?.business_name || "Restaurante"}
            </h1>
            {businessSettings?.business_slogan && (
              <p className="text-sm text-muted-foreground">
                {businessSettings.business_slogan}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
              {deliverySettings?.estimated_preparation_time && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{deliverySettings.estimated_preparation_time} min</span>
                </div>
              )}
              {deliverySettings?.default_delivery_fee !== undefined && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>Taxa: {formatBRL(Number(deliverySettings.default_delivery_fee))}</span>
                </div>
              )}
              {deliverySettings?.min_order_value !== undefined &&
                deliverySettings.min_order_value > 0 && (
                  <span className="text-muted-foreground">
                    Pedido mín: {formatBRL(Number(deliverySettings.min_order_value))}
                  </span>
                )}
              {(() => {
                const status = isStoreCurrentlyOpen(deliverySettings);
                const todayLabel = formatTodayShifts(deliverySettings?.business_hours);
                if (status.open) {
                  return (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-500">Aberto agora</Badge>
                      {todayLabel && (
                        <span className="text-xs text-muted-foreground">Hoje: {todayLabel}</span>
                      )}
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">Fechado</Badge>
                    {todayLabel && (
                      <span className="text-xs text-muted-foreground">Hoje: {todayLabel}</span>
                    )}
                    {status.nextOpenLabel && (
                      <span className="text-xs text-muted-foreground">Abre {status.nextOpenLabel}</span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Loyalty entry */}
        {loyaltyActive && (
          <div className="mt-4">
            {customer ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <Star className="h-4 w-4 text-primary fill-primary" />
                <span>
                  Olá{customer.name ? `, ${customer.name.split(" ")[0]}` : ""}! Você tem{" "}
                  <strong className="text-primary">{points} pontos</strong>
                  {cashbackPerPoint > 0 && (
                    <span className="text-muted-foreground"> · {formatBRL(cashbackValue)} em cashback</span>
                  )}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(loyaltyPath)}
                  >
                    Ver prêmios
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCustomer(null)}
                    title="Sair"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIdentifyOpen(true)}
                className="gap-2"
              >
                <Star className="h-4 w-4 text-primary" />
                Ver meus pontos de fidelidade
              </Button>
            )}
          </div>
        )}
      </div>

      <LoyaltyIdentifyDialog
        open={identifyOpen}
        onOpenChange={setIdentifyOpen}
        onConfirm={(c) => setCustomer(c)}
      />
    </div>
  );
};
