import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Ticket, Search, CheckCircle, AlertTriangle, XCircle, Gift, User, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import {
  useLookupCouponForPDV,
  useRedeemCouponForPDV,
  useSearchCouponsForPDV,
  useLaunchCouponOnComanda,
  type CouponLookupResult,
  type CouponRewardType,
} from "@/hooks/use-coupon-redemption";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

export interface AppliedCouponReward {
  winId: string;
  code: string;
  prizeName: string;
  customerName: string;
  rewardType: CouponRewardType;
  rewardValue: number;
}

interface RedeemCouponDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * "payment" — aparece botão "Aplicar na comanda" que chama onApply com a recompensa.
   * "standalone" — só consulta + botão "Marcar como resgatado".
   */
  mode: "payment" | "standalone";
  onApply?: (reward: AppliedCouponReward) => void;
}

const rewardLabel = (t: CouponRewardType, v: number | null) => {
  if (t === "percent") return `${v ?? 0}% de desconto`;
  if (t === "fixed") return `${formatBRL(Number(v ?? 0))} de desconto`;
  if (t === "free_product") return "Produto grátis (aplicar manualmente)";
  return "Prêmio manual (validar com gerente)";
};

export function RedeemCouponDialog({ open, onOpenChange, mode, onApply }: RedeemCouponDialogProps) {
  const [tab, setTab] = useState<"code" | "customer">("code");
  const [code, setCode] = useState("");
  const [customerTerm, setCustomerTerm] = useState("");
  const [searchResults, setSearchResults] = useState<CouponLookupResult[]>([]);
  const [result, setResult] = useState<CouponLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLaunch, setShowLaunch] = useState(false);
  const [selectedComandaId, setSelectedComandaId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [productSearch, setProductSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const { visibleUserId } = useEstablishmentId();

  const lookup = useLookupCouponForPDV();
  const redeem = useRedeemCouponForPDV();
  const search = useSearchCouponsForPDV();
  const launch = useLaunchCouponOnComanda();

  const openComandasQ = useQuery({
    queryKey: ["open-comandas-for-coupon", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [] as { id: string; label: string }[];
      const { data, error } = await supabase
        .from("pdv_comandas")
        .select("id, comanda_number, customer_name, order_id")
        .eq("user_id", visibleUserId)
        .in("status", ["aberta", "aguardando_pagamento", "em_cobranca"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const orderIds = Array.from(new Set((data ?? []).map((c) => c.order_id).filter(Boolean))) as string[];
      const tableByOrder = new Map<string, string>();
      if (orderIds.length) {
        const { data: orders } = await supabase
          .from("pdv_orders")
          .select("id, table_id")
          .in("id", orderIds);
        const tIds = Array.from(new Set((orders ?? []).map((o: any) => o.table_id).filter(Boolean))) as string[];
        const tableMap = new Map<string, string>();
        if (tIds.length) {
          const { data: tables } = await supabase
            .from("pdv_tables")
            .select("id, table_number")
            .in("id", tIds);
          (tables ?? []).forEach((t: any) => tableMap.set(t.id, String(t.table_number)));
        }
        (orders ?? []).forEach((o: any) => {
          if (o.table_id && tableMap.has(o.table_id)) tableByOrder.set(o.id, tableMap.get(o.table_id)!);
        });
      }
      return (data ?? []).map((c) => {
        const tbl = c.order_id ? tableByOrder.get(c.order_id) : null;
        const who = c.customer_name?.trim() || `Comanda ${c.comanda_number}`;
        const where = tbl ? `Mesa ${tbl}` : "Balcão";
        return { id: c.id, label: `${where} · ${who} (#${c.comanda_number})` };
      });
    },
    enabled: open && showLaunch && !!visibleUserId,
  });

  useEffect(() => {
    if (open) {
      setTab("code");
      setCode("");
      setCustomerTerm("");
      setSearchResults([]);
      setResult(null);
      setError(null);
      setShowLaunch(false);
      setSelectedComandaId("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleValidate = () => {
    setError(null);
    setResult(null);
    lookup.mutate(code, {
      onSuccess: (r) => setResult(r),
      onError: (e: Error) => setError(e.message),
    });
  };

  const handleSearchCustomer = () => {
    setError(null);
    setResult(null);
    setSearchResults([]);
    search.mutate(customerTerm, {
      onSuccess: (list) => {
        setSearchResults(list);
        if (list.length === 0) setError("Nenhum cupom encontrado para este cliente");
      },
      onError: (e: Error) => setError(e.message),
    });
  };

  const handleApply = () => {
    if (!result) return;
    if (result.status !== "active") return;

    const isAutoDiscount = result.reward_type === "percent" || result.reward_type === "fixed";
    if (mode === "payment" && !isAutoDiscount) {
      // recompensa manual / produto grátis — marca como resgatado e avisa o operador
      redeem.mutate(result.win_id, {
        onSuccess: () => {
          toast.success(`Cupom ${result.coupon_code} validado — aplique ${result.prize_name} manualmente`);
          onOpenChange(false);
        },
        onError: (e: Error) => setError(e.message),
      });
      return;
    }

    if (mode === "payment" && isAutoDiscount && onApply) {
      // resgata atomicamente e aplica no PaymentDialog
      redeem.mutate(result.win_id, {
        onSuccess: () => {
          onApply({
            winId: result.win_id,
            code: result.coupon_code,
            prizeName: result.prize_name,
            customerName: result.customer_name,
            rewardType: result.reward_type,
            rewardValue: Number(result.reward_value ?? 0),
          });
          onOpenChange(false);
        },
        onError: (e: Error) => setError(e.message),
      });
      return;
    }

    // standalone
    redeem.mutate(result.win_id, {
      onSuccess: () => {
        toast.success(`Cupom ${result.coupon_code} resgatado`);
        onOpenChange(false);
      },
      onError: (e: Error) => setError(e.message),
    });
  };

  const statusBadge = (r: CouponLookupResult) => {
    if (r.status === "active") return <Badge variant="secondary" className="gap-1"><CheckCircle className="h-3 w-3" /> Válido</Badge>;
    if (r.status === "redeemed") return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" /> Já resgatado</Badge>;
    if (r.status === "expired") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Expirado</Badge>;
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Outra loja</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Resgatar Cupom
          </DialogTitle>
          <DialogDescription>
            {mode === "payment"
              ? "Valide o código e aplique o desconto na comanda."
              : "Consulte ou marque um cupom como resgatado."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as "code" | "customer"); setError(null); setResult(null); setSearchResults([]); setShowLaunch(false); setSelectedComandaId(""); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="code">Por código</TabsTrigger>
              <TabsTrigger value="customer">Por cliente</TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="space-y-2 mt-3">
              <Label htmlFor="coupon-code">Código do cupom</Label>
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  id="coupon-code"
                  placeholder="Ex: ABC-1234"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleValidate();
                    }
                  }}
                  className="font-mono uppercase tracking-wider"
                  autoComplete="off"
                />
                <Button onClick={handleValidate} disabled={lookup.isPending || !code.trim()}>
                  <Search className="h-4 w-4 mr-1" />
                  Validar
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="customer" className="space-y-2 mt-3">
              <Label htmlFor="customer-term">Nome ou telefone</Label>
              <div className="flex gap-2">
                <Input
                  ref={customerInputRef}
                  id="customer-term"
                  placeholder="Ex: Maria ou 11999..."
                  value={customerTerm}
                  onChange={(e) => setCustomerTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchCustomer();
                    }
                  }}
                  autoComplete="off"
                />
                <Button onClick={handleSearchCustomer} disabled={search.isPending || !customerTerm.trim()}>
                  <Search className="h-4 w-4 mr-1" />
                  Buscar
                </Button>
              </div>

              {searchResults.length > 0 && !result && (
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto pt-2">
                  {searchResults.map((r) => (
                    <button
                      key={r.win_id}
                      type="button"
                      onClick={() => setResult(r)}
                      className="w-full text-left rounded-md border bg-card hover:bg-accent transition-colors p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">{r.coupon_code}</span>
                        {statusBadge(r)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.customer_name} · {r.prize_name}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-lg">{result.coupon_code}</span>
                {statusBadge(result)}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">{result.customer_name}</span>
                  <span className="text-muted-foreground">· {result.customer_whatsapp}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{result.prize_name}</span>
                  <span className="text-muted-foreground">· {result.campaign_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">
                    Validade: {format(parseISO(result.coupon_expires_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
                {result.redeemed_at && (
                  <div className="text-xs text-muted-foreground">
                    Resgatado em {format(parseISO(result.redeemed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                )}
              </div>

              <div className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
                Recompensa: {rewardLabel(result.reward_type, result.reward_value)}
              </div>

              {result.status === "active" && (() => {
                const canLaunch =
                  mode === "standalone" &&
                  result.reward_type === "free_product" &&
                  !!result.reward_product_id;
                const primaryLabel =
                  mode === "payment"
                    ? (result.reward_type === "percent" || result.reward_type === "fixed")
                      ? "Aplicar na comanda"
                      : "Validar cupom"
                    : "Marcar como resgatado";

                return (
                  <div className="space-y-2">
                    {canLaunch && !showLaunch && (
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() => setShowLaunch(true)}
                      >
                        Lançar prêmio em comanda
                      </Button>
                    )}

                    {canLaunch && showLaunch && (
                      <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                        <Label className="text-xs">Selecione a comanda aberta</Label>
                        <Select value={selectedComandaId || "none"} onValueChange={(v) => setSelectedComandaId(v === "none" ? "" : v)}>
                          <SelectTrigger>
                            <SelectValue placeholder={openComandasQ.isLoading ? "Carregando..." : "Escolher comanda"} />
                          </SelectTrigger>
                          <SelectContent>
                            {(openComandasQ.data ?? []).length === 0 && (
                              <SelectItem value="none" disabled>Nenhuma comanda aberta</SelectItem>
                            )}
                            {(openComandasQ.data ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => { setShowLaunch(false); setSelectedComandaId(""); }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            className="flex-1"
                            disabled={!selectedComandaId || launch.isPending}
                            onClick={() => {
                              if (!result.reward_product_id) return;
                              launch.mutate(
                                {
                                  winId: result.win_id,
                                  comandaId: selectedComandaId,
                                  productId: result.reward_product_id,
                                  prizeName: result.prize_name,
                                  couponCode: result.coupon_code,
                                },
                                {
                                  onSuccess: () => {
                                    toast.success(`Prêmio lançado e cupom ${result.coupon_code} resgatado`);
                                    onOpenChange(false);
                                  },
                                  onError: (e: Error) => setError(e.message),
                                },
                              );
                            }}
                          >
                            Confirmar
                          </Button>
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full"
                      size="lg"
                      variant={canLaunch ? "outline" : "default"}
                      onClick={handleApply}
                      disabled={redeem.isPending}
                    >
                      {canLaunch ? "Apenas marcar como resgatado" : primaryLabel}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
