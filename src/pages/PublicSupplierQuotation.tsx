import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, PackageX, Clock, Send, ChevronDown, ListChecks, CalendarClock,
} from "lucide-react";
import { format } from "date-fns";

interface ItemResponse {
  unit_price?: number | null;
  brand?: string | null;
  delivery_days?: number | null;
  minimum_order?: number | null;
  payment_terms?: string | null;
  expiration_date?: string | null;
  notes?: string | null;
}
interface LoadItem {
  id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  response: ItemResponse | null;
}
interface LoadData {
  status: "open" | "closed" | "invalid";
  business?: { name: string | null; logo_url: string | null; color: string | null };
  supplier?: { name: string | null };
  quotation?: { request_number: string | null; deadline: string | null };
  alreadySubmitted?: boolean;
  items?: LoadItem[];
}

type FormRow = {
  unit_price: string;      // mascarado "1.234,56"
  brand: string;
  delivery_days: string;   // inteiro
  minimum_order: string;   // mascarado
  payment_terms: string;
  expiration_date: string;
  notes: string;
};
const emptyRow = (): FormRow => ({
  unit_price: "", brand: "", delivery_days: "", minimum_order: "",
  payment_terms: "", expiration_date: "", notes: "",
});

// ---- máscaras ----
const maskCurrency = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const n = parseInt(digits, 10) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseCurrency = (masked: string): number | null => {
  const digits = masked.replace(/\D/g, "");
  if (!digits) return null;
  return parseInt(digits, 10) / 100;
};
const maskInt = (raw: string): string => raw.replace(/\D/g, "");
const currencyFromNumber = (n: number | null | undefined): string =>
  n == null ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PublicSupplierQuotation() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<LoadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<Record<string, FormRow>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("quotation-supplier-form", {
        body: { action: "load", token },
      });
      if (error) throw error;
      const d = res as LoadData;
      setData(d);
      const initial: Record<string, FormRow> = {};
      (d.items ?? []).forEach((it) => {
        const r = it.response;
        initial[it.id] = r
          ? {
              unit_price: currencyFromNumber(r.unit_price),
              brand: r.brand ?? "",
              delivery_days: r.delivery_days != null ? String(r.delivery_days) : "",
              minimum_order: currencyFromNumber(r.minimum_order),
              payment_terms: r.payment_terms ?? "",
              expiration_date: r.expiration_date ?? "",
              notes: r.notes ?? "",
            }
          : emptyRow();
      });
      setForm(initial);
    } catch {
      setData({ status: "invalid" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // SEO/head da página pública: título dinâmico + noindex (link privado do fornecedor).
  useEffect(() => {
    const prevTitle = document.title;
    const biz = data?.business?.name;
    document.title = biz ? `Orçamento · ${biz}` : "Solicitação de Orçamento";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => {
      document.title = prevTitle;
      robots.remove();
    };
  }, [data?.business?.name]);

  const brandColor = data?.business?.color || "#0ea5e9";
  const initial = (data?.business?.name || "?").trim().charAt(0).toUpperCase();

  const setField = (itemId: string, field: keyof FormRow, value: string) =>
    setForm((f) => ({ ...f, [itemId]: { ...(f[itemId] ?? emptyRow()), [field]: value } }));

  // Copia um campo (ex.: prazo/pagamento) para TODOS os itens de uma vez.
  const applyToAll = (field: keyof FormRow, value: string) =>
    setForm((f) => {
      const next = { ...f };
      (data?.items ?? []).forEach((it) => {
        next[it.id] = { ...(next[it.id] ?? emptyRow()), [field]: value };
      });
      return next;
    });

  const items = data?.items ?? [];
  const filledCount = useMemo(
    () => Object.values(form).filter((r) => r.unit_price.trim() !== "").length,
    [form],
  );
  const progress = items.length ? Math.round((filledCount / items.length) * 100) : 0;

  const handleSubmit = async () => {
    const responses = items
      .filter((it) => (form[it.id]?.unit_price ?? "").trim() !== "")
      .map((it) => {
        const r = form[it.id];
        return {
          quotation_item_id: it.id,
          unit_price: parseCurrency(r.unit_price),
          brand: r.brand || null,
          delivery_days: r.delivery_days || null,
          minimum_order: r.minimum_order ? parseCurrency(r.minimum_order) : null,
          payment_terms: r.payment_terms || null,
          expiration_date: r.expiration_date || null,
          notes: r.notes || null,
        };
      });

    if (responses.length === 0) {
      toast.error("Informe ao menos o preço de um item.");
      return;
    }

    // Prazo de entrega e pagamento são obrigatórios nos itens respondidos.
    const incomplete = items.find((it) => {
      const r = form[it.id];
      if (!r || !r.unit_price.trim()) return false;
      return !r.delivery_days.trim() || !r.payment_terms.trim();
    });
    if (incomplete) {
      toast.error(`Preencha o prazo de entrega e a forma de pagamento de "${incomplete.ingredient_name}".`);
      return;
    }

    setSubmitting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("quotation-supplier-form", {
        body: { action: "submit", token, responses },
      });
      if (error) throw error;
      if ((res as any)?.status === "closed") {
        toast.error("Esta cotação foi encerrada.");
        await load();
        return;
      }
      setDone(true);
    } catch {
      toast.error("Não foi possível enviar. Tente novamente.");
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
  if (!data || data.status === "invalid") {
    return (
      <Centered>
        <PackageX className="h-12 w-12 text-muted-foreground mb-3" />
        <h1 className="text-lg font-semibold">Link inválido</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Este link de orçamento não existe ou expirou. Peça um novo ao estabelecimento.
        </p>
      </Centered>
    );
  }
  if (done) {
    return (
      <Centered>
        <CheckCircle2 className="h-14 w-14 text-emerald-500 mb-3" />
        <h1 className="text-xl font-semibold">Orçamento enviado!</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Obrigado. {data.business?.name} recebeu sua proposta.
        </p>
        {data.status === "open" && (
          <Button variant="outline" className="mt-5" onClick={() => { setDone(false); load(); }}>
            Editar meu orçamento
          </Button>
        )}
      </Centered>
    );
  }

  const closed = data.status === "closed";
  const deadlineStr = data.quotation?.deadline
    ? format(new Date(data.quotation.deadline), "dd/MM/yyyy")
    : null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Toaster />

      {/* Header com a marca do cliente */}
      <header className="text-white" style={{ backgroundColor: brandColor }}>
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
          <div className="min-w-0">
            <p className="text-xs opacity-80 leading-none">Solicitação de orçamento</p>
            <h1 className="text-lg font-semibold truncate">{data.business?.name ?? "Cotação"}</h1>
            <p className="text-xs opacity-90">{data.quotation?.request_number}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 space-y-4 pb-28">
        {/* Resumo do que precisa ser preenchido */}
        <Card className="border-l-4" style={{ borderLeftColor: brandColor }}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <ListChecks className="h-5 w-5 mt-0.5 shrink-0" style={{ color: brandColor }} />
              <div className="text-sm">
                <p className="font-medium">
                  Olá{data.supplier?.name ? `, ${data.supplier.name}` : ""}! 👋
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {data.business?.name} pediu seu orçamento para{" "}
                  <strong>{items.length} {items.length === 1 ? "item" : "itens"}</strong>. Em cada
                  um, informe <strong>preço</strong>, <strong>prazo de entrega</strong> e{" "}
                  <strong>forma de pagamento</strong>. Marca, validade e pedido mínimo são opcionais.
                </p>
              </div>
            </div>

            {deadlineStr && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                Responder até <strong className="text-foreground">{deadlineStr}</strong>
              </div>
            )}

            {/* lista-resumo dos itens */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {items.map((it, i) => (
                <Badge key={it.id} variant="secondary" className="text-[11px] font-normal">
                  {i + 1}. {it.ingredient_name}
                </Badge>
              ))}
            </div>

            {data.alreadySubmitted && !closed && (
              <p className="text-xs text-amber-600">
                Você já enviou este orçamento. Pode ajustar e reenviar.
              </p>
            )}
          </CardContent>
        </Card>

        {closed && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <Clock className="h-4 w-4 shrink-0" />
            Esta cotação foi encerrada e não aceita mais respostas.
          </div>
        )}

        {items.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum item para cotar neste link.
          </CardContent></Card>
        ) : (
          items.map((it, i) => {
            const r = form[it.id] ?? emptyRow();
            const isOpenDetails = !!expanded[it.id];
            const qty = it.quantity;
            const total = parseCurrency(r.unit_price);
            return (
              <Card key={it.id} className={r.unit_price ? "ring-1 ring-inset" : ""}
                style={r.unit_price ? { ["--tw-ring-color" as any]: brandColor } : undefined}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-6 w-6 rounded-full text-white text-xs flex items-center justify-center shrink-0"
                        style={{ backgroundColor: brandColor }}
                      >
                        {i + 1}
                      </span>
                      <span className="font-semibold truncate">{it.ingredient_name}</span>
                    </div>
                    <Badge variant="outline" className="shrink-0">{qty} {it.unit}</Badge>
                  </div>

                  {/* Preço (destaque) — obrigatório */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Preço por {it.unit} *</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                      <Input
                        inputMode="numeric"
                        placeholder="0,00"
                        value={r.unit_price}
                        disabled={closed}
                        onChange={(e) => setField(it.id, "unit_price", maskCurrency(e.target.value))}
                        className="pl-9 h-11 text-base font-medium"
                      />
                    </div>
                    {total != null && (
                      <p className="text-xs text-muted-foreground">
                        Total estimado: <strong>{(total * qty).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong> ({qty} {it.unit})
                      </p>
                    )}
                  </div>

                  {/* Prazo de entrega + Pagamento — obrigatórios */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Prazo de entrega (dias) *</Label>
                      <Input inputMode="numeric" placeholder="Ex: 3" value={r.delivery_days} disabled={closed}
                        onChange={(e) => setField(it.id, "delivery_days", maskInt(e.target.value))} />
                      {items.length > 1 && r.delivery_days.trim() !== "" && (
                        <button type="button" className="text-[11px] text-primary hover:underline"
                          onClick={() => applyToAll("delivery_days", r.delivery_days)}>
                          aplicar a todos
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Pagamento *</Label>
                      <Input placeholder="Ex: à vista, 30 dias" value={r.payment_terms} disabled={closed}
                        onChange={(e) => setField(it.id, "payment_terms", e.target.value)} />
                      {items.length > 1 && r.payment_terms.trim() !== "" && (
                        <button type="button" className="text-[11px] text-primary hover:underline"
                          onClick={() => applyToAll("payment_terms", r.payment_terms)}>
                          aplicar a todos
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Extras opcionais recolhíveis */}
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded((e) => ({ ...e, [it.id]: !isOpenDetails }))}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpenDetails ? "rotate-180" : ""}`} />
                    {isOpenDetails
                      ? "Ocultar campos extras"
                      : "Preencher também (opcional): marca, pedido mínimo, validade, observação"}
                  </button>

                  {isOpenDetails && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs">Marca</Label>
                        <Input value={r.brand} disabled={closed}
                          onChange={(e) => setField(it.id, "brand", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Pedido mínimo</Label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                          <Input inputMode="numeric" value={r.minimum_order} disabled={closed}
                            className="pl-8"
                            onChange={(e) => setField(it.id, "minimum_order", maskCurrency(e.target.value))} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Validade</Label>
                        <Input type="date" value={r.expiration_date} disabled={closed}
                          onChange={(e) => setField(it.id, "expiration_date", e.target.value)} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Observação</Label>
                        <Textarea rows={2} value={r.notes} disabled={closed}
                          onChange={(e) => setField(it.id, "notes", e.target.value)} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </main>

      {/* Barra fixa de envio com progresso */}
      {!closed && items.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur">
          <div className="h-1 w-full bg-muted">
            <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: brandColor }} />
          </div>
          <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {filledCount} de {items.length} preenchidos
            </span>
            <Button
              onClick={handleSubmit}
              disabled={submitting || filledCount === 0}
              className="h-11 px-5"
              style={{ backgroundColor: brandColor }}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar orçamento
            </Button>
          </div>
        </div>
      )}
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
