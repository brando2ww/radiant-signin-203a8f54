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
  Plus, X,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface Offer {
  unit_price?: number | null;
  brand?: string | null;
  conservation?: string | null;
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
  offers?: Offer[];
}
interface LoadData {
  status: "open" | "closed" | "invalid";
  business?: { name: string | null; logo_url: string | null; color: string | null };
  supplier?: { name: string | null };
  quotation?: { request_number: string | null; deadline: string | null };
  alreadySubmitted?: boolean;
  items?: LoadItem[];
}

/** Uma oferta = uma marca. O fornecedor pode mandar quantas quiser por item. */
type OfferRow = {
  key: string;
  unit_price: string;      // mascarado "1.234,56"
  brand: string;
  conservation: string;    // "" | resfriado | congelado | ambiente
  delivery_days: string;   // inteiro
  minimum_order: string;   // mascarado
  payment_terms: string;
  expiration_date: string;
  notes: string;
};

const CONSERVATIONS = [
  { value: "resfriado", label: "Resfriado" },
  { value: "congelado", label: "Congelado" },
  { value: "ambiente", label: "Ambiente (seco)" },
];

let offerSeq = 0;
const emptyOffer = (base?: Partial<OfferRow>): OfferRow => ({
  key: `offer-${++offerSeq}`,
  unit_price: "", brand: "", conservation: "", delivery_days: "",
  minimum_order: "", payment_terms: "", expiration_date: "", notes: "",
  ...base,
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

const isFilled = (o: OfferRow) => o.unit_price.trim() !== "";

export default function PublicSupplierQuotation() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<LoadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<Record<string, OfferRow[]>>({});
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
      const initial: Record<string, OfferRow[]> = {};
      (d.items ?? []).forEach((it) => {
        const saved = it.offers ?? [];
        initial[it.id] = saved.length
          ? saved.map((r) =>
              emptyOffer({
                unit_price: currencyFromNumber(r.unit_price),
                brand: r.brand ?? "",
                conservation: r.conservation ?? "",
                delivery_days: r.delivery_days != null ? String(r.delivery_days) : "",
                minimum_order: currencyFromNumber(r.minimum_order),
                payment_terms: r.payment_terms ?? "",
                expiration_date: r.expiration_date ?? "",
                notes: r.notes ?? "",
              }),
            )
          : [emptyOffer()];
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

  const setField = (itemId: string, key: string, field: keyof OfferRow, value: string) =>
    setForm((f) => ({
      ...f,
      [itemId]: (f[itemId] ?? []).map((o) => (o.key === key ? { ...o, [field]: value } : o)),
    }));

  // Nova marca do mesmo item: repete o que costuma ser igual entre marcas
  // (prazo, pagamento, mínimo) e deixa em branco o que muda.
  const addOffer = (itemId: string) =>
    setForm((f) => {
      const list = f[itemId] ?? [];
      const last = list[list.length - 1];
      return {
        ...f,
        [itemId]: [
          ...list,
          emptyOffer({
            delivery_days: last?.delivery_days ?? "",
            payment_terms: last?.payment_terms ?? "",
            minimum_order: last?.minimum_order ?? "",
          }),
        ],
      };
    });

  const removeOffer = (itemId: string, key: string) =>
    setForm((f) => {
      const rest = (f[itemId] ?? []).filter((o) => o.key !== key);
      return { ...f, [itemId]: rest.length ? rest : [emptyOffer()] };
    });

  // Copia um campo (ex.: prazo/pagamento) para TODAS as ofertas de TODOS os itens.
  const applyToAll = (field: keyof OfferRow, value: string) =>
    setForm((f) => {
      const next: Record<string, OfferRow[]> = {};
      Object.entries(f).forEach(([itemId, list]) => {
        next[itemId] = list.map((o) => ({ ...o, [field]: value }));
      });
      return next;
    });

  const items = data?.items ?? [];
  const filledCount = useMemo(
    () => items.filter((it) => (form[it.id] ?? []).some(isFilled)).length,
    [form, items],
  );
  const offerCount = useMemo(
    () => Object.values(form).reduce((acc, list) => acc + list.filter(isFilled).length, 0),
    [form],
  );
  const progress = items.length ? Math.round((filledCount / items.length) * 100) : 0;

  const handleSubmit = async () => {
    const responses = items.flatMap((it) =>
      (form[it.id] ?? []).filter(isFilled).map((o) => ({
        quotation_item_id: it.id,
        unit_price: parseCurrency(o.unit_price),
        brand: o.brand.trim() || null,
        conservation: o.conservation || null,
        delivery_days: o.delivery_days || null,
        minimum_order: o.minimum_order ? parseCurrency(o.minimum_order) : null,
        payment_terms: o.payment_terms || null,
        expiration_date: o.expiration_date || null,
        notes: o.notes || null,
      })),
    );

    if (responses.length === 0) {
      toast.error("Informe ao menos o preço de um item.");
      return;
    }

    // Marca, prazo e pagamento são obrigatórios em toda oferta preenchida.
    const incomplete = items.find((it) =>
      (form[it.id] ?? [])
        .filter(isFilled)
        .some((o) => !o.brand.trim() || !o.delivery_days.trim() || !o.payment_terms.trim()),
    );
    if (incomplete) {
      toast.error(
        `Em "${incomplete.ingredient_name}", preencha marca, prazo de entrega e forma de pagamento em todas as ofertas.`,
      );
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
  // deadline é DATE ("yyyy-MM-dd"): new Date() leria como UTC e voltaria um dia.
  const deadlineStr = data.quotation?.deadline
    ? format(parseISO(data.quotation.deadline), "dd/MM/yyyy")
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
                  oferta, informe <strong>marca</strong>, <strong>preço</strong>,{" "}
                  <strong>prazo de entrega</strong> e <strong>forma de pagamento</strong>.
                </p>
                <p className="text-muted-foreground mt-1.5">
                  Trabalha com <strong>mais de uma marca</strong> no mesmo item? Use{" "}
                  <strong>"Adicionar outra marca"</strong> e mande todas — cada uma é avaliada
                  separadamente.
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
            const offers = form[it.id] ?? [];
            const qty = it.quantity;
            const anyFilled = offers.some(isFilled);
            return (
              <Card key={it.id} className={anyFilled ? "ring-1 ring-inset" : ""}
                style={anyFilled ? { ["--tw-ring-color" as any]: brandColor } : undefined}>
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

                  {offers.map((o, oi) => (
                    <OfferFields
                      key={o.key}
                      offer={o}
                      index={oi}
                      totalOffers={offers.length}
                      item={it}
                      itemCount={items.length}
                      closed={closed}
                      brandColor={brandColor}
                      expanded={!!expanded[o.key]}
                      onToggleExpanded={() =>
                        setExpanded((e) => ({ ...e, [o.key]: !e[o.key] }))
                      }
                      onChange={(field, value) => setField(it.id, o.key, field, value)}
                      onRemove={() => removeOffer(it.id, o.key)}
                      onApplyToAll={applyToAll}
                    />
                  ))}

                  {!closed && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-dashed"
                      onClick={() => addOffer(it.id)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Adicionar outra marca de {it.ingredient_name}
                    </Button>
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
              {offerCount > filledCount && ` · ${offerCount} ofertas`}
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

/** Bloco de uma oferta (uma marca) dentro de um item. */
function OfferFields({
  offer: o,
  index,
  totalOffers,
  item,
  itemCount,
  closed,
  brandColor,
  expanded,
  onToggleExpanded,
  onChange,
  onRemove,
  onApplyToAll,
}: {
  offer: OfferRow;
  index: number;
  totalOffers: number;
  item: LoadItem;
  itemCount: number;
  closed: boolean;
  brandColor: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (field: keyof OfferRow, value: string) => void;
  onRemove: () => void;
  onApplyToAll: (field: keyof OfferRow, value: string) => void;
}) {
  const total = parseCurrency(o.unit_price);

  return (
    <div className={totalOffers > 1 ? "rounded-lg border bg-muted/20 p-3 space-y-3" : "space-y-3"}>
      {totalOffers > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {index + 1}ª marca{o.brand ? ` · ${o.brand}` : ""}
          </span>
          {!closed && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              title="Remover esta marca"
              onClick={onRemove}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* Marca + Preço — obrigatórios */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium">Marca *</Label>
          <Input
            placeholder="Ex: Friboi"
            value={o.brand}
            disabled={closed}
            onChange={(e) => onChange("brand", e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Preço por {item.unit} *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <Input
              inputMode="numeric"
              placeholder="0,00"
              value={o.unit_price}
              disabled={closed}
              onChange={(e) => onChange("unit_price", maskCurrency(e.target.value))}
              className="pl-9 h-11 text-base font-medium"
            />
          </div>
        </div>
      </div>
      {total != null && (
        <p className="text-xs text-muted-foreground -mt-1">
          Total estimado:{" "}
          <strong>
            {(total * item.quantity).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </strong>{" "}
          ({item.quantity} {item.unit})
        </p>
      )}

      {/* Conservação — opcional */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Conservação</Label>
        <div className="flex flex-wrap gap-1.5">
          {CONSERVATIONS.map((c) => {
            const active = o.conservation === c.value;
            return (
              <button
                key={c.value}
                type="button"
                disabled={closed}
                // Clicar de novo limpa: o campo é opcional e itens secos não têm
                // essa dimensão.
                onClick={() => onChange("conservation", active ? "" : c.value)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                  active ? "text-white border-transparent" : "hover:bg-muted"
                }`}
                style={active ? { backgroundColor: brandColor } : undefined}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Prazo de entrega + Pagamento — obrigatórios */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium">Prazo de entrega (dias) *</Label>
          <Input inputMode="numeric" placeholder="Ex: 3" value={o.delivery_days} disabled={closed}
            onChange={(e) => onChange("delivery_days", maskInt(e.target.value))} />
          {(itemCount > 1 || totalOffers > 1) && o.delivery_days.trim() !== "" && (
            <button type="button" className="text-[11px] text-primary hover:underline"
              onClick={() => onApplyToAll("delivery_days", o.delivery_days)}>
              aplicar a todos
            </button>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Pagamento *</Label>
          <Input placeholder="Ex: à vista, 30 dias" value={o.payment_terms} disabled={closed}
            onChange={(e) => onChange("payment_terms", e.target.value)} />
          {(itemCount > 1 || totalOffers > 1) && o.payment_terms.trim() !== "" && (
            <button type="button" className="text-[11px] text-primary hover:underline"
              onClick={() => onApplyToAll("payment_terms", o.payment_terms)}>
              aplicar a todos
            </button>
          )}
        </div>
      </div>

      {/* Extras opcionais recolhíveis */}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={onToggleExpanded}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        {expanded
          ? "Ocultar campos extras"
          : "Preencher também (opcional): validade, pedido mínimo, observação"}
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Validade</Label>
            <Input type="date" value={o.expiration_date} disabled={closed}
              onChange={(e) => onChange("expiration_date", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pedido mínimo</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
              <Input inputMode="numeric" value={o.minimum_order} disabled={closed}
                className="pl-8"
                onChange={(e) => onChange("minimum_order", maskCurrency(e.target.value))} />
            </div>
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Observação</Label>
            <Textarea rows={2} value={o.notes} disabled={closed}
              onChange={(e) => onChange("notes", e.target.value)} />
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
