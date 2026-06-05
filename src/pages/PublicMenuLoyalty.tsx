import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Star, Gift, History, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import {
  useLoyaltySettings,
  useLoyaltyPrizes,
  useCustomerLoyaltyBalance,
  useCustomerLoyaltyHistory,
  useRedeemLoyaltyPrize,
} from "@/hooks/use-delivery-loyalty";
import { usePublicLoyaltySession } from "@/hooks/use-public-loyalty-session";
import { LoyaltyIdentifyDialog } from "@/components/public-menu/LoyaltyIdentifyDialog";
import { useBusinessSettings } from "@/hooks/use-public-menu";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PublicMenuLoyalty = () => {
  const { userId: handle } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const { data: resolvedUserId, isLoading: resolvingHandle } = useQuery({
    queryKey: ["resolve-menu-handle", handle],
    queryFn: async () => {
      if (!handle) return null;
      if (UUID_RE.test(handle)) return handle;
      const { data, error } = await supabase.rpc("resolve_business_slug", { _slug: handle });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    enabled: !!handle,
    staleTime: 1000 * 60 * 5,
  });

  const userId = resolvedUserId || undefined;
  const slug = handle || "";
  const { session, save, clear } = usePublicLoyaltySession(slug);
  const { data: businessSettings } = useBusinessSettings(userId || "");
  const { data: loyaltySettings } = useLoyaltySettings(userId);
  const { data: balanceData } = useCustomerLoyaltyBalance(session?.session_token);
  const { data: prizes = [] } = useLoyaltyPrizes(userId);
  const { data: history = [] } = useCustomerLoyaltyHistory(session?.session_token);
  const redeem = useRedeemLoyaltyPrize();

  const [identifyOpen, setIdentifyOpen] = useState(!session);
  const [redemptionCode, setRedemptionCode] = useState<string | null>(null);

  const points = balanceData?.balance ?? 0;
  const expiringSoon = balanceData?.expiring_soon ?? 0;
  const cashbackPerPoint = Number(loyaltySettings?.cashback_value_per_point ?? 0);
  const pointsPerReal = Number(loyaltySettings?.points_per_real ?? 1);
  const activePrizes = (prizes as any[]).filter(
    (p) => p.is_active && (!p.max_quantity || p.redeemed_count < p.max_quantity),
  );

  const handleRedeem = (prize: any) => {
    if (!session) return;
    if (points < prize.points_cost) {
      toast.error("Pontos insuficientes");
      return;
    }
    redeem.mutate(
      { session_token: session.session_token, prize_id: prize.id },
      {
        onSuccess: (res: any) => {
          setRedemptionCode(String(prize.id).slice(0, 8).toUpperCase());
          toast.success(`Prêmio "${res?.prize_name || prize.name}" resgatado!`);
        },
        onError: (e: any) => toast.error(e?.message || "Erro ao resgatar"),
      },
    );
  };

  if (resolvingHandle) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Cardápio não encontrado</p>
      </div>
    );
  }

  const loyaltyActive = loyaltySettings?.is_active ?? false;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/cardapio/${handle}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">Programa de Fidelidade</h1>
            <p className="text-xs text-muted-foreground truncate">
              {businessSettings?.business_name || ""}
            </p>
          </div>
          {session && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 pb-24">
        {!loyaltyActive ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Este estabelecimento não possui programa de fidelidade ativo.
            </CardContent>
          </Card>
        ) : !session ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <Star className="h-10 w-10 text-primary mx-auto" />
              <p className="text-muted-foreground">Identifique-se para ver seus pontos.</p>
              <Button onClick={() => setIdentifyOpen(true)}>Informar telefone</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardDescription>Seu saldo</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl">
                  <Star className="h-7 w-7 text-primary fill-primary" />
                  {points} <span className="text-base font-normal text-muted-foreground">pontos</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {cashbackPerPoint > 0 && (
                  <p>
                    Equivale a{" "}
                    <strong className="text-foreground">{formatBRL(points * cashbackPerPoint)}</strong> em cashback.
                  </p>
                )}
                <p>
                  Regra: a cada R$ 1,00 gasto você ganha <strong>{pointsPerReal}</strong>{" "}
                  ponto{pointsPerReal > 1 ? "s" : ""}.
                </p>
                {expiringSoon > 0 && (
                  <p className="text-foreground">
                    ⚠ <strong>{expiringSoon}</strong> pontos vencem nos próximos 30 dias.
                  </p>
                )}
              </CardContent>
            </Card>

            <section className="space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" /> Prêmios disponíveis
              </h2>
              {activePrizes.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nenhum prêmio cadastrado no momento.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {activePrizes.map((prize) => {
                    const canRedeem = points >= prize.points_cost;
                    return (
                      <Card key={prize.id} className="overflow-hidden">
                        {prize.image_url && (
                          <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                            <img src={prize.image_url} alt={prize.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <CardContent className="p-4 space-y-3">
                          <div>
                            <h3 className="font-semibold">{prize.name}</h3>
                            {prize.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{prize.description}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3" /> {prize.points_cost} pts
                            </Badge>
                            <Button
                              size="sm"
                              disabled={!canRedeem || redeem.isPending}
                              onClick={() => handleRedeem(prize)}
                            >
                              {canRedeem ? "Resgatar" : `Faltam ${prize.points_cost - points}`}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <History className="h-5 w-5 text-primary" /> Histórico
              </h2>
              <Card>
                <CardContent className="p-0">
                  {history.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground text-sm">
                      Nenhuma movimentação ainda.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {history.map((h: any) => (
                        <li key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
                          <div>
                            <p className="font-medium">{h.description || (h.type === "earn" ? "Pontos ganhos" : "Resgate")}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                          <span
                            className={`font-semibold ${h.points >= 0 ? "text-primary" : "text-destructive"}`}
                          >
                            {h.points > 0 ? "+" : ""}
                            {h.points}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </main>

      <LoyaltyIdentifyDialog
        slug={slug}
        open={identifyOpen}
        onOpenChange={setIdentifyOpen}
        onAuthenticated={(s) => save(s)}
      />

      {redemptionCode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setRedemptionCode(null)}
        >
          <Card className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Resgate confirmado!</CardTitle>
              <CardDescription>
                Apresente este código no estabelecimento ou ao receber seu próximo pedido.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg py-6 text-center">
                <p className="text-3xl font-mono font-bold tracking-widest">{redemptionCode}</p>
              </div>
              <Button className="w-full" onClick={() => setRedemptionCode(null)}>
                Fechar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PublicMenuLoyalty;
