import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, PackageX, Truck, ChevronRight, ChevronLeft, PackageCheck,
  AlertTriangle, Lock,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatBRL } from "@/lib/format";
import { conservationLabel } from "@/lib/whatsapp-message";

interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  order_date: string | null;
  expected_delivery: string | null;
  total: number | null;
  supplier_name: string;
  item_count: number;
}
interface OrderItem {
  id: string;
  ingredient_name: string;
  brand: string | null;
  conservation: string | null;
  quantity: number;
  quantity_received: number | null;
  unit: string;
  unit_price: number;
  total_price: number;
  notes: string | null;
}
interface OrderDetail {
  id: string;
  order_number: string;
  status: string;
  expected_delivery: string | null;
  subtotal: number | null;
  freight: number | null;
  discount: number | null;
  total: number | null;
  notes: string | null;
  supplier_name: string;
}
interface Business {
  name: string | null;
  logo_url: string | null;
  color: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Enviado",
  confirmed: "Confirmado",
  partial: "Recebido parcial",
};

// Quantidade aceita decimal (kg, L). Mantém vírgula, que é como se digita no
// celular em pt-BR.
const maskQty = (raw: string): string => {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const [int, ...rest] = cleaned.split(",");
  return rest.length ? `${int},${rest.join("").slice(0, 3)}` : int;
};
const parseQty = (masked: string): number | null => {
  if (!masked.trim()) return null;
  const n = Number(masked.replace(",", "."));
  return Number.isNaN(n) ? null : n;
};
const qtyToMask = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(n).replace(".", ",");

export default function PublicPurchaseReceipt() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [business, setBusiness] = useState<Business>({ name: null, logo_url: null, color: null });

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [loadingOrder, setLoadingOrder] = useState(false);

  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [doneBy, setDoneBy] = useState<string | null>(null);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("purchase-order-receipt", {
      body: { token, ...body },
    });
    if (error) throw error;
    return data as any;
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await call({ action: "list" });
      if (res?.status === "invalid") {
        setInvalid(true);
        return;
      }
      setBusiness(res.business ?? {});
      setOrders(res.orders ?? []);
      setDetail(null);
      setItems([]);
    } catch {
      setInvalid(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const prev = document.title;
    document.title = business.name ? `Recebimento · ${business.name}` : "Recebimento";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => { document.title = prev; robots.remove(); };
  }, [business.name]);

  const brandColor = business.color || "#0ea5e9";

  const openOrder = async (orderId: string) => {
    setLoadingOrder(true);
    try {
      const res = await call({ action: "load", orderId });
      if (res?.status === "invalid") {
        toast.error("Pedido não encontrado.");
        return;
      }
      setDetail(res.order);
      setItems(res.items ?? []);
      // Pré-preenche com o que foi pedido: o caso comum é chegar tudo certo, e
      // quem confere só mexe no que veio diferente.
      const initial: Record<string, string> = {};
      (res.items ?? []).forEach((it: OrderItem) => {
        const base = it.quantity_received && it.quantity_received > 0
          ? it.quantity_received
          : it.quantity;
        initial[it.id] = qtyToMask(base);
      });
      setReceived(initial);
    } catch {
      toast.error("Não foi possível abrir o pedido.");
    } finally {
      setLoadingOrder(false);
    }
  };

  const divergences = useMemo(
    () =>
      items.filter((it) => {
        const q = parseQty(received[it.id] ?? "");
        return q != null && q !== it.quantity;
      }),
    [items, received],
  );

  const receivedTotal = useMemo(
    () =>
      items.reduce((sum, it) => {
        const q = parseQty(received[it.id] ?? "") ?? 0;
        return sum + q * it.unit_price;
      }, 0),
    [items, received],
  );

  const handleConfirm = async () => {
    const payload = items
      .map((it) => ({ item_id: it.id, quantity: parseQty(received[it.id] ?? "") }))
      .filter((i) => i.quantity != null);

    if (payload.length === 0) {
      toast.error("Informe a quantidade recebida de ao menos um item.");
      return;
    }

    const over = items.find((it) => {
      const q = parseQty(received[it.id] ?? "");
      return q != null && q > it.quantity;
    });
    if (over) {
      toast.error(
        `"${over.ingredient_name}": não dá para receber mais do que foi pedido (${qtyToMask(over.quantity)} ${over.unit}) por aqui. Ajuste no sistema.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await call({
        action: "receive",
        orderId: detail!.id,
        items: payload,
        password,
      });

      if (res?.error === "invalid_password") {
        toast.error("Senha incorreta.");
        return;
      }
      if (res?.status === "closed") {
        toast.error("Este pedido não está mais aberto para recebimento.");
        await loadList();
        setAskPassword(false);
        return;
      }
      if (res?.error) {
        toast.error(res.message || "Não foi possível registrar o recebimento.");
        return;
      }

      setDoneBy(res.actor_name ?? null);
      setAskPassword(false);
      setPassword("");
    } catch {
      toast.error("Não foi possível registrar o recebimento.");
    } finally {
      setSubmitting(false);
    }
  };

  // ----- estados -----
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (invalid) {
    return (
      <Centered>
        <PackageX className="h-12 w-12 text-muted-foreground mb-3" />
        <h1 className="text-lg font-semibold">QR inválido</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Este código não é mais válido. Peça um novo ao responsável.
        </p>
      </Centered>
    );
  }
  if (doneBy) {
    return (
      <Centered>
        <CheckCircle2 className="h-14 w-14 text-emerald-500 mb-3" />
        <h1 className="text-xl font-semibold">Recebimento registrado!</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conferido por <strong>{doneBy}</strong>. O estoque já foi atualizado.
        </p>
        <Button
          className="mt-5"
          style={{ backgroundColor: brandColor }}
          onClick={() => { setDoneBy(null); loadList(); }}
        >
          Receber outro pedido
        </Button>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Toaster />

      <header className="text-white" style={{ backgroundColor: brandColor }}>
        <div className="mx-auto max-w-2xl px-4 py-5 flex items-center gap-3">
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt={business.name ?? ""}
              className="h-14 w-14 rounded-full object-cover border-2 border-white/70 bg-white shrink-0"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <PackageCheck className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs opacity-80 leading-none">Recebimento de mercadoria</p>
            <h1 className="text-lg font-semibold truncate">{business.name ?? "Recebimento"}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 space-y-3 pb-28">
        {/* ---------- LISTA ---------- */}
        {!detail && (
          <>
            <p className="text-sm text-muted-foreground px-1">
              Selecione o pedido que chegou para conferir.
            </p>

            {orders.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  Nenhum pedido aguardando recebimento.
                </CardContent>
              </Card>
            ) : (
              orders.map((o) => (
                <Card
                  key={o.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => openOrder(o.id)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{o.order_number}</span>
                        <Badge variant={o.status === "partial" ? "secondary" : "outline"} className="text-[11px]">
                          {STATUS_LABELS[o.status] ?? o.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{o.supplier_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {o.item_count} {o.item_count === 1 ? "item" : "itens"}
                        {o.total != null && ` · ${formatBRL(Number(o.total))}`}
                        {o.expected_delivery &&
                          ` · previsto ${format(parseISO(o.expected_delivery), "dd/MM")}`}
                      </p>
                    </div>
                    {loadingOrder ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </>
        )}

        {/* ---------- CONFERÊNCIA ---------- */}
        {detail && (
          <>
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => { setDetail(null); setItems([]); }}
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar aos pedidos
            </button>

            <Card className="border-l-4" style={{ borderLeftColor: brandColor }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{detail.order_number}</span>
                  <Badge variant="outline" className="text-[11px]">
                    {STATUS_LABELS[detail.status] ?? detail.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{detail.supplier_name}</p>
                {detail.notes && (
                  <p className="text-xs text-muted-foreground mt-2">{detail.notes}</p>
                )}
              </CardContent>
            </Card>

            {items.map((it) => {
              const q = parseQty(received[it.id] ?? "");
              const diff = q != null ? q - it.quantity : 0;
              return (
                <Card key={it.id}>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="font-medium">{it.ingredient_name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {it.brand && (
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            {it.brand}
                          </Badge>
                        )}
                        {it.conservation && (
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {conservationLabel(it.conservation)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <div className="text-sm">
                        <p className="text-muted-foreground">
                          Pedido: <strong className="text-foreground">{qtyToMask(it.quantity)} {it.unit}</strong>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBRL(it.unit_price)}/{it.unit} · {formatBRL(it.total_price)}
                        </p>
                      </div>
                      <div className="w-32 space-y-1">
                        <Label className="text-xs font-medium">Recebido ({it.unit})</Label>
                        <Input
                          inputMode="decimal"
                          value={received[it.id] ?? ""}
                          onChange={(e) =>
                            setReceived((r) => ({ ...r, [it.id]: maskQty(e.target.value) }))
                          }
                          className="h-11 text-base font-medium text-right"
                        />
                      </div>
                    </div>

                    {q != null && diff !== 0 && (
                      <div
                        className={`flex items-center gap-1.5 rounded-md p-2 text-xs ${
                          diff < 0
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-red-50 text-red-800 border border-red-200"
                        }`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {diff < 0
                          ? `Faltando ${qtyToMask(Math.abs(diff))} ${it.unit}`
                          : `Acima do pedido em ${qtyToMask(diff)} ${it.unit} — ajuste no sistema`}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            <Card>
              <CardContent className="p-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total do pedido</span>
                  <span>{detail.total != null ? formatBRL(Number(detail.total)) : "—"}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Total recebido</span>
                  <span>{formatBRL(receivedTotal)}</span>
                </div>
                {divergences.length > 0 && (
                  <p className="pt-1 text-xs text-amber-700">
                    {divergences.length} {divergences.length === 1 ? "item diverge" : "itens divergem"} do pedido.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* Barra fixa de confirmação */}
      {detail && (
        <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-2xl px-4 py-3">
            <Button
              className="w-full h-12 text-base"
              style={{ backgroundColor: brandColor }}
              onClick={() => setAskPassword(true)}
            >
              <PackageCheck className="h-5 w-5 mr-2" />
              Marcar como recebido
            </Button>
          </div>
        </div>
      )}

      {/* Senha do operador: ver é livre, confirmar é assinado. */}
      <Dialog open={askPassword} onOpenChange={(o) => { setAskPassword(o); if (!o) setPassword(""); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4" />
              Quem está recebendo?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Sua senha</Label>
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password && handleConfirm()}
              className="h-11 text-center text-lg tracking-widest"
            />
            <p className="text-xs text-muted-foreground">
              A mesma senha que você usa no caixa. O recebimento fica registrado no seu nome.
            </p>
          </div>
          <DialogFooter>
            <Button
              className="w-full h-11"
              style={{ backgroundColor: brandColor }}
              disabled={!password || submitting}
              onClick={handleConfirm}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="max-w-sm w-full text-center flex flex-col items-center rounded-xl border bg-background p-8">
        {children}
      </div>
    </div>
  );
}
