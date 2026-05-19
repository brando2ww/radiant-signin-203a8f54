import { useBusinessSettings, usePublicSettings } from "@/hooks/use-public-menu";
import { Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/format";
import { isStoreCurrentlyOpen, formatTodayShifts } from "@/lib/delivery-hours";

interface PublicMenuHeaderProps {
  userId: string;
}

export const PublicMenuHeader = ({ userId }: PublicMenuHeaderProps) => {
  const { data: businessSettings } = useBusinessSettings(userId);
  const { data: deliverySettings } = usePublicSettings(userId);

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
      </div>
    </div>
  );
};
