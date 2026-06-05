import { useState } from "react";
import { useBusinessSettings, usePublicSettings } from "@/hooks/use-public-menu";
import { Clock, MapPin, Star, Menu, LogIn, LogOut, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isStoreCurrentlyOpen, formatTodayShifts } from "@/lib/delivery-hours";
import { formatBRL } from "@/lib/format";
import { useNavigate } from "react-router-dom";
import { useLoyaltySettings } from "@/hooks/use-delivery-loyalty";
import { useAuth } from "@/contexts/AuthContext";
import { CustomerLogin } from "@/components/public-menu/checkout/CustomerLogin";

interface PublicMenuHeaderProps {
  userId: string;
  handle?: string;
}

export const PublicMenuHeader = ({ userId, handle }: PublicMenuHeaderProps) => {
  const { data: businessSettings } = useBusinessSettings(userId);
  const { data: deliverySettings } = usePublicSettings(userId);
  const { data: loyaltySettings } = useLoyaltySettings(userId);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const loyaltyActive = loyaltySettings?.is_active ?? false;
  const loyaltyPath = `/cardapio/${handle || userId}/meus-pontos`;
  const isCustomer =
    !!user && (user.user_metadata as any)?.role === "delivery_customer";
  const displayName =
    (user?.user_metadata as any)?.name ||
    (user?.user_metadata as any)?.full_name ||
    user?.email;

  return (
    <div className="border-b bg-card relative">
      {/* Hamburger menu */}
      <div className="absolute top-3 right-3 z-10">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="h-10 w-10 rounded-full shadow-md"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80">
            <SheetHeader>
              <SheetTitle>Minha conta</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-2">
              {isCustomer ? (
                <>
                  <div className="flex items-center gap-3 px-2 py-3 border-b">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {displayName || "Cliente"}
                      </p>
                      {user?.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate(loyaltyPath);
                    }}
                  >
                    <Star className="h-4 w-4 text-primary" />
                    Meus pontos de fidelidade
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 text-destructive"
                    onClick={async () => {
                      await signOut();
                      setMenuOpen(false);
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      setMenuOpen(false);
                      setLoginOpen(true);
                    }}
                  >
                    <LogIn className="h-4 w-4" />
                    Entrar / Criar conta
                  </Button>

                  {loyaltyActive && (
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate(loyaltyPath);
                      }}
                    >
                      <Star className="h-4 w-4 text-primary" />
                      Programa de fidelidade
                    </Button>
                  )}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

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

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Entrar na sua conta</DialogTitle>
          </DialogHeader>
          <CustomerLogin
            onConfirm={() => setLoginOpen(false)}
            onBack={() => setLoginOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
