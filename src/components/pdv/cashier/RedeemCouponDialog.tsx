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
  type CouponLookupResult,
  type CouponRewardType,
} from "@/hooks/use-coupon-redemption";
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
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CouponLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookup = useLookupCouponForPDV();
  const redeem = useRedeemCouponForPDV();

  useEffect(() => {
    if (open) {
      setCode("");
      setResult(null);
      setError(null);
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
          <div className="space-y-2">
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
          </div>

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

              {result.status === "active" && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleApply}
                  disabled={redeem.isPending}
                >
                  {mode === "payment"
                    ? (result.reward_type === "percent" || result.reward_type === "fixed")
                      ? "Aplicar na comanda"
                      : "Validar cupom"
                    : "Marcar como resgatado"}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
