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
  Plus, X, Truck, CreditCard, Ban,
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
  unavailable_reason?: string | null;
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

/**
 * Prazo de entrega e pagamento quase sempre são condição do fornecedor, não do
 * item: ele define uma vez ("all") e vale para tudo. Quando varia (ex.: congelado
 * entrega em 3 dias, seco em 1), ele troca para "each" e preenche oferta a oferta.
 */
type FieldMode = "all" | "each";

const CONSERVATIONS = [
  { value: "resfriado", label: "Resfriado" },
  { value: "congelado", label: "Congelado" },
  { value: "ambiente", label: "Ambiente (seco)" },
];

/** Recusa do item. Vale como resposta: o lojista para de esperar esse preço. */
const UNAVAILABLE_REASONS = [
  { value: "sem_estoque", label: "Sem estoque no momento" },
  { value: "nao_trabalha", label: "Não trabalho com este item" },
  { value: "em_falta", label: "Em falta no fornecedor" },
];
type Refusal = { reason: string; note: string };

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
  const [deliveryMode, setDeliveryMode] = useState<FieldMode>("all");
  const [paymentMode, setPaymentMode] = useState<FieldMode>("all");
  const [globalDelivery, setGlobalDelivery] = useState("");
  const [globalPayment, setGlobalPayment] = useState("");
  const [refusals, setRefusals] = useState<Record<string, Refusal>>({});

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
      const initialRefusals: Record<string, Refusal> = {};
      (d.items ?? []).forEach((it) => {
        // Recusa é gravada como resposta sem preço: sai da lista de ofertas.
        const refused = (it.offers ?? []).find((r) => r.unavailable_reason);
        if (refused) {
          initialRefusals[it.id] = {
            reason: refused.unavailable_reason!,
            note: refused.notes ?? "",
          };
        }
        const saved = (it.offers ?? []).filter((r) => !r.unavailable_reason);
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
      setRefusals(initialRefusals);

      // Reabriu o link depois de responder: deduz o modo pelo que ele mandou.
      // Um único valor distinto em tudo = condição geral; mais de um = por item.
      const saved = (d.items ?? []).flatMap((it) => it.offers ?? []);
      const distinct = (values: (string | null | undefined)[]) =>
        Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)));

      const days = distinct(saved.map((r) => (r.delivery_days != null ? String(r.delivery_days) : "")));
      if (days.length === 1) { setDeliveryMode("all"); setGlobalDelivery(days[0]); }
      else if (days.length > 1) setDeliveryMode("each");

      const terms = distinct(saved.map((r) => r.payment_terms));
      if (terms.length === 1) { setPaymentMode("all"); setGlobalPayment(terms[0]); }
      else if (terms.length > 1) setPaymentMode("each");
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

  // Troca entre condição geral e por item, sem perder o que já foi digitado:
  // ao ir para "por item", semeia as ofertas vazias com o valor geral (ele só
  // ajusta as exceções); ao voltar para "geral", puxa o primeiro valor preenchido.
  const switchMode = (
    field: "delivery_days" | "payment_terms",
    mode: FieldMode,
    globalValue: string,
    setGlobalValue: (v: string) => void,
    setMode: (m: FieldMode) => void,
  ) => {
    setMode(mode);
    if (mode === "each") {
      if (globalValue.trim())
        setForm((f) =>
          Object.fromEntries(
            Object.entries(f).map(([itemId, list]) => [
              itemId,
              list.map((o) => (o[field].trim() ? o : { ...o, [field]: globalValue })),
            ]),
          ),
        );
    } else if (!globalValue.trim()) {
      const first = Object.values(form)
        .flat()
        .map((o) => o[field])
        .find((v) => v.trim() !== "");
      if (first) setGlobalValue(first);
    }
  };

  // Marcar/desmarcar "não tenho este item". Desmarcar devolve o formulário de
  // oferta intacto — o que ele já tinha digitado continua lá.
  const toggleRefusal = (itemId: string) =>
    setRefusals((r) => {
      if (r[itemId]) {
        const { [itemId]: _removed, ...rest } = r;
        return rest;
      }
      return { ...r, [itemId]: { reason: "", note: "" } };
    });

  const setRefusalField = (itemId: string, field: keyof Refusal, value: string) =>
    setRefusals((r) => ({ ...r, [itemId]: { ...r[itemId], [field]: value } }));

  const items = data?.items ?? [];
  // Recusar também é responder: conta no progresso, senão a barra nunca fecha
  // para quem não trabalha com parte da lista.
  const answeredCount = useMemo(
    () => items.filter((it) => refusals[it.id] || (form[it.id] ?? []).some(isFilled)).length,
    [form, refusals, items],
  );
  const offerCount = useMemo(
    () =>
      Object.entries(form).reduce(
        (acc, [itemId, list]) => acc + (refusals[itemId] ? 0 : list.filter(isFilled).length),
        0,
      ),
    [form, refusals],
  );
  const progress = items.length ? Math.round((answeredCount / items.length) * 100) : 0;

  // No modo "geral" a condição do topo é a que vale, não o que sobrou na linha.
  const effectiveDelivery = (o: OfferRow) =>
    deliveryMode === "all" ? globalDelivery.trim() : o.delivery_days.trim();
  const effectivePayment = (o: OfferRow) =>
    paymentMode === "all" ? globalPayment.trim() : o.payment_terms.trim();

  const handleSubmit = async () => {
    const refused = items.filter((it) => refusals[it.id]);
    const missingReason = refused.find((it) => !refusals[it.id].reason);
    if (missingReason) {
      toast.error(`Escolha o motivo em "${missingReason.ingredient_name}".`);
      return;
    }

    const refusalResponses = refused.map((it) => ({
      quotation_item_id: it.id,
      unavailable_reason: refusals[it.id].reason,
      notes: refusals[it.id].note.trim() || null,
    }));

    const offerResponses = items
      .filter((it) => !refusals[it.id])
      .flatMap((it) =>
        (form[it.id] ?? []).filter(isFilled).map((o) => ({
          quotation_item_id: it.id,
          unit_price: parseCurrency(o.unit_price),
          brand: o.brand.trim() || null,
          conservation: o.conservation || null,
          delivery_days: effectiveDelivery(o) || null,
          minimum_order: o.minimum_order ? parseCurrency(o.minimum_order) : null,
          payment_terms: effectivePayment(o) || null,
          expiration_date: o.expiration_date || null,
          notes: o.notes || null,
        })),
      );

    const responses = [...offerResponses, ...refusalResponses];

    if (responses.length === 0) {
      toast.error("Informe o preço de um item ou marque que não tem.");
      return;
    }

    // Condição geral só é exigida quando existe alguma oferta com preço.
    if (offerResponses.length > 0 && deliveryMode === "all" && !globalDelivery.trim()) {
      toast.error("Informe o prazo de entrega nas condições, no topo da página.");
      return;
    }
    if (offerResponses.length > 0 && paymentMode === "all" && !globalPayment.trim()) {
      toast.error("Informe a forma de pagamento nas condições, no topo da página.");
      return;
    }

    // Marca sempre; prazo e pagamento só entram aqui quando são por item.
    const incomplete = items.filter((it) => !refusals[it.id]).find((it) =>
      (form[it.id] ?? [])
        .filter(isFilled)
        .some(
          (o) =>
            !o.brand.trim() ||
            (deliveryMode === "each" && !o.delivery_days.trim()) ||
            (paymentMode === "each" && !o.payment_terms.trim()),
        ),
    );
    if (incomplete) {
      const missing = [
        "marca",
        ...(deliveryMode === "each" ? ["prazo de entrega"] : []),
        ...(paymentMode === "each" ? ["forma de pagamento"] : []),
      ];
      toast.error(
        `Em "${incomplete.ingredient_name}", preencha ${missing.join(", ")} em todas as ofertas.`,
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
                  oferta, informe <strong>marca</strong> e <strong>preço</strong> ·{" "}
                  <strong>prazo de entrega</strong> e <strong>pagamento</strong> você define logo
                  abaixo, de uma vez só.
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

        {items.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <p className="text-sm font-medium">Condições da proposta</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Se o prazo ou o pagamento mudam de um item para outro, escolha
                  "Definir por item".
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ConditionField
                  icon={Truck}
                  label="Prazo de entrega (dias)"
                  placeholder="Ex: 3"
                  inputMode="numeric"
                  mask={maskInt}
                  mode={deliveryMode}
                  onModeChange={(m) =>
                    switchMode("delivery_days", m, globalDelivery, setGlobalDelivery, setDeliveryMode)
                  }
                  value={globalDelivery}
                  onValueChange={setGlobalDelivery}
                  closed={closed}
                  brandColor={brandColor}
                />
                <ConditionField
                  icon={CreditCard}
                  label="Forma de pagamento"
                  placeholder="Ex: à vista, 30 dias"
                  mode={paymentMode}
                  onModeChange={(m) =>
                    switchMode("payment_terms", m, globalPayment, setGlobalPayment, setPaymentMode)
                  }
                  value={globalPayment}
                  onValueChange={setGlobalPayment}
                  closed={closed}
                  brandColor={brandColor}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {items.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum item para cotar neste link.
          </CardContent></Card>
        ) : (
          items.map((it, i) => {
            const offers = form[it.id] ?? [];
            const qty = it.quantity;
            const refusal = refusals[it.id];
            const anyFilled = !refusal && offers.some(isFilled);
            return (
              <Card key={it.id} className={anyFilled ? "ring-1 ring-inset" : refusal ? "bg-muted/40" : ""}
                style={anyFilled ? { ["--tw-ring-color" as any]: brandColor } : undefined}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-6 w-6 rounded-full text-white text-xs flex items-center justify-center shrink-0"
                        style={{ backgroundColor: refusal ? "#94a3b8" : brandColor }}
                      >
                        {i + 1}
                      </span>
                      <span className={`font-semibold truncate ${refusal ? "text-muted-foreground line-through" : ""}`}>
                        {it.ingredient_name}
                      </span>
                    </div>
                    <Badge variant="outline" className="shrink-0">{qty} {it.unit}</Badge>
                  </div>

                  {refusal ? (
                    <RefusalPanel
                      refusal={refusal}
                      closed={closed}
                      brandColor={brandColor}
                      onChange={(field, value) => setRefusalField(it.id, field, value)}
                      onUndo={() => toggleRefusal(it.id)}
                    />
                  ) : (
                  <>
                  {offers.map((o, oi) => (
                    <OfferFields
                      key={o.key}
                      offer={o}
                      index={oi}
                      totalOffers={offers.length}
                      item={it}
                      showDelivery={deliveryMode === "each"}
                      showPayment={paymentMode === "each"}
                      closed={closed}
                      brandColor={brandColor}
                      expanded={!!expanded[o.key]}
                      onToggleExpanded={() =>
                        setExpanded((e) => ({ ...e, [o.key]: !e[o.key] }))
                      }
                      onChange={(field, value) => setField(it.id, o.key, field, value)}
                      onRemove={() => removeOffer(it.id, o.key)}
                    />
                  ))}

                  {!closed && (
                    <div className="space-y-2">
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
                      <button
                        type="button"
                        className="w-full text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                        onClick={() => toggleRefusal(it.id)}
                      >
                        Não tenho este item
                      </button>
                    </div>
                  )}
                  </>
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
              {answeredCount} de {items.length} respondidos
              {offerCount > answeredCount && ` · ${offerCount} ofertas`}
            </span>
            <Button
              onClick={handleSubmit}
              disabled={submitting || answeredCount === 0}
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

/** Item recusado: escolhe o motivo e, se quiser, explica em uma linha. */
function RefusalPanel({
  refusal,
  closed,
  brandColor,
  onChange,
  onUndo,
}: {
  refusal: Refusal;
  closed: boolean;
  brandColor: string;
  onChange: (field: keyof Refusal, value: string) => void;
  onUndo: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-background p-3 space-y-3">
      <div className="flex items-start gap-2">
        <Ban className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="text-sm">
          <p className="font-medium">Você marcou que não tem este item</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Escolha o motivo · assim o comprador não fica esperando seu preço.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {UNAVAILABLE_REASONS.map((r) => {
          const active = refusal.reason === r.value;
          return (
            <button
              key={r.value}
              type="button"
              disabled={closed}
              onClick={() => onChange("reason", r.value)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                active ? "text-white border-transparent" : "hover:bg-muted"
              }`}
              style={active ? { backgroundColor: brandColor } : undefined}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <Input
        placeholder="Observação (opcional). Ex: volto a ter dia 20"
        value={refusal.note}
        disabled={closed}
        onChange={(e) => onChange("note", e.target.value)}
        className="h-10 text-sm"
      />

      {!closed && (
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={onUndo}
        >
          Na verdade eu tenho · voltar a ofertar
        </button>
      )}
    </div>
  );
}

/** Condição que vale para a proposta inteira — ou que o fornecedor abre por item. */
function ConditionField({
  icon: Icon,
  label,
  placeholder,
  inputMode,
  mask,
  mode,
  onModeChange,
  value,
  onValueChange,
  closed,
  brandColor,
}: {
  icon: typeof Truck;
  label: string;
  placeholder: string;
  inputMode?: "numeric";
  mask?: (raw: string) => string;
  mode: FieldMode;
  onModeChange: (mode: FieldMode) => void;
  value: string;
  onValueChange: (value: string) => void;
  closed: boolean;
  brandColor: string;
}) {
  const OPTIONS: { value: FieldMode; label: string }[] = [
    { value: "all", label: "Igual para todos" },
    { value: "each", label: "Definir por item" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <Label className="text-xs font-medium">{label} *</Label>
      </div>

      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
        {OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={closed}
              onClick={() => onModeChange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                active ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
              style={active ? { color: brandColor } : undefined}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {mode === "all" ? (
        <Input
          placeholder={placeholder}
          inputMode={inputMode}
          value={value}
          disabled={closed}
          onChange={(e) => onValueChange(mask ? mask(e.target.value) : e.target.value)}
          className="h-11"
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Você preenche em cada oferta, abaixo.
        </p>
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
  showDelivery,
  showPayment,
  closed,
  brandColor,
  expanded,
  onToggleExpanded,
  onChange,
  onRemove,
}: {
  offer: OfferRow;
  index: number;
  totalOffers: number;
  item: LoadItem;
  showDelivery: boolean;
  showPayment: boolean;
  closed: boolean;
  brandColor: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (field: keyof OfferRow, value: string) => void;
  onRemove: () => void;
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

      {/* Prazo e pagamento só aparecem aqui quando o fornecedor escolheu
          defini-los por item; caso contrário valem as condições do topo. */}
      {(showDelivery || showPayment) && (
        <div className="grid grid-cols-2 gap-3">
          {showDelivery && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">Prazo de entrega (dias) *</Label>
              <Input inputMode="numeric" placeholder="Ex: 3" value={o.delivery_days} disabled={closed}
                onChange={(e) => onChange("delivery_days", maskInt(e.target.value))} />
            </div>
          )}
          {showPayment && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">Pagamento *</Label>
              <Input placeholder="Ex: à vista, 30 dias" value={o.payment_terms} disabled={closed}
                onChange={(e) => onChange("payment_terms", e.target.value)} />
            </div>
          )}
        </div>
      )}

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
