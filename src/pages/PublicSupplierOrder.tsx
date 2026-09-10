import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Loader2, PackageX, CheckCircle2, Truck, CreditCard, CalendarDays, Printer,
  MessageCircle, ClipboardList, ShieldCheck,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatarPagamento } from "@/lib/purchase-terms";

/**
 * O pedido de compra como o FORNECEDOR vê, sem login.
 *
 * O WhatsApp leva só o resumo — a Meta não aceita quebra de linha dentro de
 * parâmetro, então a relação de itens nunca coube na mensagem. Aqui ela cabe
 * inteira, com preço unitário, e o fornecedor confirma o aceite no fim.
 */

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  notes: string | null;
}
interface LoadData {
  status: "ok" | "invalid";
  business?: {
    name: string; logo_url: string | null; color: string | null;
    cnpj: string | null; phone: string | null;
    address: string | null; city: string | null; state: string | null;
  };
  supplier?: { name: string | null; contact_name: string | null } | null;
  order?: {
    number: string; status: string; date: string | null;
    expected_delivery: string | null; payment_terms: string | null;
    subtotal: number; discount: number; freight: number; total: number;
    confirmed_at: string | null; supplier_note: string | null;
  };
  items?: OrderItem[];
}

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Quantidade sem casas sobrando: 2,5 kg fica "2,5"; 3 un fica "3". */
const formatQty = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

// Datas de pedido são DATE ("yyyy-MM-dd"): new Date() leria como UTC e voltaria um dia.
const formatDate = (iso: string | null | undefined) =>
  iso ? format(parseISO(iso), "dd/MM/yyyy") : null;

const somenteDigitos = (s: string) => s.replace(/\D/g, "");

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-6 text-center">
    {children}
  </div>
);

export default function PublicSupplierOrder() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<LoadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("purchase-order-public", {
        body: { action: "load", token },
      });
      if (error) throw error;
      setData(res as LoadData);
      const nota = (res as LoadData)?.order?.supplier_note;
      if (nota) setNote(nota);
    } catch {
      setData({ status: "invalid" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const brandColor = data?.business?.color || "#111827";
  const initial = (data?.business?.name ?? "P").trim().charAt(0).toUpperCase();
  const items = data?.items ?? [];
  const order = data?.order;
  const confirmado = !!order?.confirmed_at;

  const totalItens = useMemo(
    () => items.reduce((s, i) => s + i.total_price, 0),
    [items],
  );

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("purchase-order-public", {
        body: { action: "confirm", token, note },
      });
      if (error) throw error;
      if ((res as any)?.status === "closed") {
        toast.error("Este pedido não está mais aberto para confirmação.");
        await load();
        return;
      }
      toast.success("Pedido confirmado! O comprador já foi avisado.");
      await load();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Não foi possível confirmar. Tente novamente.");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.status === "invalid" || !order) {
    return (
      <Centered>
        <PackageX className="h-12 w-12 text-muted-foreground mb-3" />
        <h1 className="text-lg font-semibold">Link inválido</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Este pedido não existe ou o link expirou. Peça um novo ao estabelecimento.
        </p>
      </Centered>
    );
  }

  const entrega = formatDate(order.expected_delivery);
  const emitido = formatDate(order.date);
  const cidade = [data.business?.city, data.business?.state].filter(Boolean).join("/");
  const telefone = data.business?.phone ? somenteDigitos(data.business.phone) : "";

  return (
    <div className="min-h-screen bg-muted/30">
      <Toaster />

      {/* Marca do cliente, igual à página de orçamento */}
      <header className="text-white print:bg-white print:text-black" style={{ backgroundColor: brandColor }}>
        <div className="mx-auto max-w-2xl px-4 py-5 flex items-center gap-3">
          {data.business?.logo_url ? (
            <img
              src={data.business.logo_url}
              alt={data.business?.name ?? ""}
              className="h-14 w-14 rounded-full object-cover border-2 border-white/70 bg-white shrink-0"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold shrink-0">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs opacity-80 leading-none">Pedido de compra</p>
            <h1 className="text-lg font-semibold truncate">{data.business?.name}</h1>
            <p className="text-xs opacity-90">
              {order.number}
              {emitido ? ` · ${emitido}` : ""}
            </p>
          </div>
          <Button
            variant="ghost" size="icon"
            className="text-white hover:bg-white/20 shrink-0 print:hidden"
            onClick={() => window.print()}
            title="Imprimir ou salvar em PDF"
          >
            <Printer className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 space-y-4 pb-32 print:pb-4">
        {confirmado && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Pedido confirmado</p>
              <p className="text-xs mt-0.5">
                Você confirmou em{" "}
                {format(new Date(order.confirmed_at!), "dd/MM/yyyy 'às' HH:mm")}.
                {order.supplier_note ? ` Recado enviado: “${order.supplier_note}”` : ""}
              </p>
            </div>
          </div>
        )}

        {/* Abertura: quem é, o que foi fechado e sob quais condições */}
        <Card className="border-l-4" style={{ borderLeftColor: brandColor }}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <ClipboardList className="h-5 w-5 mt-0.5 shrink-0" style={{ color: brandColor }} />
              <div className="text-sm">
                <p className="font-medium">
                  Olá{data.supplier?.name ? `, ${data.supplier.name}` : ""}! 👋
                </p>
                <p className="text-muted-foreground mt-0.5">
                  Sua proposta foi a escolhida. {data.business?.name} fechou com você{" "}
                  <strong>{items.length} {items.length === 1 ? "item" : "itens"}</strong>, no total
                  de <strong className="text-foreground">{formatBRL(order.total)}</strong>. Confira
                  a relação abaixo e confirme o pedido.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-background p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Truck className="h-3.5 w-3.5" /> Entrega prevista
                </div>
                <p className="text-sm font-medium mt-0.5">{entrega ?? "A combinar"}</p>
              </div>
              <div className="rounded-lg border bg-background p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" /> Pagamento
                </div>
                <p className="text-sm font-medium mt-0.5">{formatarPagamento(order.payment_terms)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Relação de itens — o motivo desta página existir */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-medium">Relação de itens</p>
              <span className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? "item" : "itens"}
              </span>
            </div>

            <ul className="divide-y">
              {items.map((item, i) => (
                <li key={item.id} className="px-4 py-3 flex items-start gap-3">
                  <span
                    className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-[11px] font-semibold flex items-center justify-center text-white"
                    style={{ backgroundColor: brandColor }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatQty(item.quantity)} {item.unit} × {formatBRL(item.unit_price)}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">{item.notes}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold tabular-nums shrink-0">
                    {formatBRL(item.total_price)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="px-4 py-3 border-t space-y-1.5 bg-muted/30">
              {(order.freight > 0 || order.discount > 0) && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatBRL(order.subtotal || totalItens)}</span>
                  </div>
                  {order.freight > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Frete</span>
                      <span className="tabular-nums">{formatBRL(order.freight)}</span>
                    </div>
                  )}
                  {order.discount > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Desconto</span>
                      <span className="tabular-nums">− {formatBRL(order.discount)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between items-baseline pt-0.5">
                <span className="text-sm font-medium">Total do pedido</span>
                <span className="text-xl font-bold tabular-nums" style={{ color: brandColor }}>
                  {formatBRL(order.total)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quem está comprando: o fornecedor precisa disso para faturar */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-2">Dados para faturamento</p>
            <dl className="text-xs space-y-1 text-muted-foreground">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0">Razão</dt>
                <dd className="text-foreground">{data.business?.name}</dd>
              </div>
              {data.business?.cnpj && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">CNPJ</dt>
                  <dd className="text-foreground">{data.business.cnpj}</dd>
                </div>
              )}
              {data.business?.address && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">Endereço</dt>
                  <dd className="text-foreground">
                    {data.business.address}{cidade ? ` · ${cidade}` : ""}
                  </dd>
                </div>
              )}
              {data.business?.phone && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">Contato</dt>
                  <dd className="text-foreground">{data.business.phone}</dd>
                </div>
              )}
            </dl>

            {telefone && (
              <a
                href={`https://wa.me/55${telefone}?text=${encodeURIComponent(
                  `Olá! Sobre o pedido ${order.number}:`,
                )}`}
                target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium print:hidden"
                style={{ color: brandColor }}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Falar com o comprador
              </a>
            )}
          </CardContent>
        </Card>

        {/* Aceite */}
        {!confirmado && (
          <Card className="print:hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" style={{ color: brandColor }} />
                <div className="text-sm">
                  <p className="font-medium">Confirmar o pedido</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Ao confirmar, você assume a entrega dos itens acima nas condições
                    combinadas. O comprador vê a confirmação na hora.
                  </p>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground" htmlFor="recado">
                  Recado para o comprador (opcional)
                </label>
                <Textarea
                  id="recado"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                  placeholder="Ex.: entrego terça pela manhã. Item 3 sai em caixa fechada de 5 kg."
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-[11px] text-muted-foreground pt-1">
          Pedido emitido por {data.business?.name}
          {emitido ? ` em ${emitido}` : ""} · via Velara
        </p>
      </main>

      {/* Barra fixa: o botão é o próximo passo, não pode ficar escondido no fim */}
      {!confirmado && (
        <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur px-4 py-3 print:hidden">
          <div className="mx-auto max-w-2xl flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground leading-none">Total do pedido</p>
              <p className="text-base font-bold tabular-nums truncate">{formatBRL(order.total)}</p>
            </div>
            <Button
              size="lg"
              onClick={handleConfirm}
              disabled={confirming}
              style={{ backgroundColor: brandColor }}
              className="text-white hover:opacity-90 shrink-0"
            >
              {confirming ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirmando…</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar pedido</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
