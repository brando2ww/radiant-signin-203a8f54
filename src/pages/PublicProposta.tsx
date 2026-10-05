import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Ban, CalendarClock, CheckCircle2, ClipboardCheck, CreditCard, FileDown, FileX, ImageOff, Loader2, Mail,
  MessageCircle, Phone, ShieldCheck, Truck, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format";
import { generateWhatsAppLink } from "@/lib/whatsapp-message";
import type { PropostaPublicaPayload } from "@/lib/vendas/documento-pdf";
import {
  calcularParcelas, dataBR, dataHoraBR, formatarDocumento, formatarPercent, formatarQtd, num, rotuloForma, soDigitos,
} from "@/components/vendas/propostas/calculos";

/**
 * A proposta como o CLIENTE vê, sem login, pelo link que o representante mandou. Abrir registra "visto"; aprovar
 * gera o pedido na hora (função vendas_proposta_responder).
 */

const db = supabase as any;

type Estado = "carregando" | "ok" | "nao_encontrada" | "erro";

const Centro = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-6 text-center">{children}</div>
);

function corSegura(hex: string | null | undefined) {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex.trim())) return "#1e293b";
  const h = hex.trim().replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  // Cor clara demais some com texto branco por cima.
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.78 ? "#1e293b" : `#${h}`;
}

function Imagem({ url }: { url: string | null }) {
  const [erro, setErro] = useState(false);
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted sm:h-20 sm:w-20">
      {url && !erro ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setErro(true)} />
      ) : (
        <ImageOff className="h-5 w-5 text-muted-foreground/50" />
      )}
    </div>
  );
}

export default function PublicProposta() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [dados, setDados] = useState<PropostaPublicaPayload | null>(null);
  const [dialogo, setDialogo] = useState<null | "aprovar" | "recusar">(null);
  const [nome, setNome] = useState("");
  const [motivo, setMotivo] = useState("");
  const [concordo, setConcordo] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [baixando, setBaixando] = useState(false);

  const carregar = useCallback(async () => {
    if (!token) return;
    const { data, error } = await db.rpc("vendas_proposta_publica", { p_token: token });
    if (error) {
      setEstado("erro");
      return;
    }
    if (!data) {
      setEstado("nao_encontrada");
      return;
    }
    setDados(data as PropostaPublicaPayload);
    setEstado("ok");
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (dados) document.title = `Proposta ${dados.proposta.number}${dados.marca?.name ? ` · ${dados.marca.name}` : ""}`;
  }, [dados]);

  const responder = async (aprovar: boolean) => {
    if (!nome.trim()) {
      toast.error("Informe o seu nome.");
      return;
    }
    setRespondendo(true);
    try {
      const { data, error } = await db.rpc("vendas_proposta_responder", {
        p_token: token,
        p_aprovar: aprovar,
        p_nome: nome.trim(),
        p_motivo: aprovar ? null : motivo.trim() || null,
      });
      if (error) throw error;
      setDialogo(null);
      if ((data as any)?.status === "approved") toast.success("Proposta aprovada. Obrigado!");
      else toast.success("Resposta registrada. Obrigado por avisar.");
      await carregar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível registrar a resposta. Tente de novo.");
      setDialogo(null);
      await carregar();
    } finally {
      setRespondendo(false);
    }
  };

  const baixarPdf = async () => {
    if (!dados) return;
    setBaixando(true);
    try {
      const { gerarPdfPropostaPublica } = await import("@/lib/vendas/documento-pdf");
      await gerarPdfPropostaPublica(dados);
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setBaixando(false);
    }
  };

  if (estado === "carregando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (estado !== "ok" || !dados) {
    return (
      <Centro>
        <FileX className="mb-3 h-12 w-12 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{estado === "erro" ? "Não foi possível abrir a proposta" : "Proposta não encontrada"}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {estado === "erro"
            ? "Confira a sua internet e tente de novo em instantes."
            : "O link pode estar incompleto ou a proposta ainda não foi liberada. Peça um novo link ao seu representante."}
        </p>
        {estado === "erro" && (
          <Button variant="outline" className="mt-4" onClick={() => { setEstado("carregando"); carregar(); }}>
            Tentar de novo
          </Button>
        )}
      </Centro>
    );
  }

  const { proposta: p, itens, cliente, representante: rep, marca } = dados;
  const cor = corSegura(marca?.primary_color);
  const loja = marca?.name || "Proposta comercial";
  const inicial = loja.trim().charAt(0).toUpperCase();
  const aberta = p.status === "sent";
  const aprovada = p.status === "approved" || p.status === "converted";
  const parcelas = calcularParcelas({
    total: num(p.total),
    parcelas: p.installments,
    primeiroVencimentoDias: p.first_due_days,
    intervaloDias: p.interval_days,
  });
  const temDesconto = itens.some((i) => num(i.discount_percent) > 0);
  const telRep = soDigitos(rep?.phone);
  const telLoja = soDigitos(marca?.phone);
  const nomeCli = cliente?.name || "cliente";
  const falarCom = telRep.length >= 10 ? telRep : telLoja.length >= 10 ? telLoja : "";
  const linkWhats = falarCom
    ? generateWhatsAppLink(falarCom, `Olá${rep?.name ? `, ${rep.name.split(" ")[0]}` : ""}! Sobre a proposta ${p.number}:`)
    : null;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Marca do estabelecimento */}
      <header className="text-white" style={{ backgroundColor: cor }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5">
          {marca?.logo_url ? (
            <img
              src={marca.logo_url}
              alt={loja}
              className="h-14 w-14 shrink-0 rounded-xl border-2 border-white/70 bg-white object-contain p-0.5"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 text-2xl font-bold">{inicial}</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-none opacity-80">Proposta comercial</p>
            <h1 className="truncate text-lg font-semibold">{loja}</h1>
            <p className="text-xs opacity-90">
              <span className="font-mono">{p.number}</span> · {dataBR(p.created_at)}
            </p>
          </div>
          <Button
            variant="ghost"
            className="shrink-0 text-white hover:bg-white/20 hover:text-white"
            onClick={baixarPdf}
            disabled={baixando}
            aria-label="Baixar PDF"
          >
            {baixando ? <Loader2 className="h-5 w-5 animate-spin sm:mr-2" /> : <FileDown className="h-5 w-5 sm:mr-2" />}
            <span className="hidden sm:inline">Baixar PDF</span>
          </Button>
        </div>
      </header>

      <main className={`mx-auto max-w-3xl space-y-4 px-4 py-4 ${aberta ? "pb-36" : "pb-10"}`}>
        {/* Situação */}
        {aprovada && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
            <div className="text-sm">
              <p className="text-base font-semibold">Proposta aprovada</p>
              <p className="mt-0.5">
                {p.responder_name ? `Aprovada por ${p.responder_name}` : "Aprovada"}
                {p.responded_at ? ` em ${dataHoraBR(p.responded_at)}` : ""}.
                {p.order_number ? (
                  <>
                    {" "}Seu pedido é o <strong className="font-mono">{p.order_number}</strong>.
                  </>
                ) : null}
              </p>
              <p className="mt-1 text-xs opacity-80">{loja} já recebeu o pedido e segue com a entrega nas condições abaixo.</p>
            </div>
          </div>
        )}
        {p.status === "rejected" && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
            <XCircle className="mt-0.5 h-6 w-6 shrink-0" />
            <div className="text-sm">
              <p className="text-base font-semibold">Proposta recusada</p>
              <p className="mt-0.5">
                {p.responder_name ? `Recusada por ${p.responder_name}` : "Recusada"}
                {p.responded_at ? ` em ${dataHoraBR(p.responded_at)}` : ""}. Obrigado pelo retorno.
              </p>
            </div>
          </div>
        )}
        {p.status === "expired" && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <CalendarClock className="mt-0.5 h-6 w-6 shrink-0" />
            <div className="text-sm">
              <p className="text-base font-semibold">Esta proposta venceu</p>
              <p className="mt-0.5">
                A validade era {dataBR(p.valid_until)}. Preços e condições podem ter mudado: fale com{" "}
                {rep?.name ? rep.name.split(" ")[0] : loja} para receber uma nova.
              </p>
            </div>
          </div>
        )}
        {p.status === "cancelled" && (
          <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
            <Ban className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="text-base font-semibold">Proposta cancelada</p>
              <p className="mt-0.5 text-muted-foreground">Esta proposta foi cancelada por {loja}. Fale com o seu representante.</p>
            </div>
          </div>
        )}

        {/* Abertura */}
        <Card className="border-l-4" style={{ borderLeftColor: cor }}>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="text-base font-semibold">Olá, {nomeCli}!</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {loja} preparou esta proposta para você
                {rep?.name ? `, com o atendimento de ${rep.name}` : ""}. Confira os itens e as condições
                {aberta ? " e aprove por aqui mesmo." : "."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="col-span-2 rounded-lg border bg-background p-3 sm:col-span-1">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: cor }}>
                  {formatBRL(p.total)}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" /> Válida até
                </p>
                <p className="mt-0.5 text-sm font-medium">{p.valid_until ? dataBR(p.valid_until) : "Sem prazo"}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" /> Pagamento
                </p>
                <p className="mt-0.5 text-sm font-medium">
                  {rotuloForma(p.payment_method)}
                  {p.installments > 1 ? ` · ${p.installments}x` : ""}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Itens */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
              <p className="text-sm font-semibold">Itens da proposta</p>
              <span className="text-xs text-muted-foreground">
                {itens.length} {itens.length === 1 ? "item" : "itens"}
              </span>
            </div>
            <ul className="divide-y">
              {itens.map((i, idx) => (
                <li key={idx} className="flex gap-3 px-4 py-3 sm:px-5">
                  <Imagem url={i.image_url} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{i.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatarQtd(i.quantity)} {i.unit || "un"} × {formatBRL(i.unit_price)}
                    </p>
                    {num(i.discount_percent) > 0 && (
                      <p className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        {formatarPercent(i.discount_percent)} de desconto
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{formatBRL(i.total)}</p>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5 border-t bg-muted/30 px-4 py-3 sm:px-5">
              {(num(p.discount_amount) > 0 || num(p.shipping_amount) > 0 || temDesconto) && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatBRL(p.subtotal)}</span>
                </div>
              )}
              {num(p.discount_amount) > 0 && (
                <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                  <span>Desconto</span>
                  <span className="tabular-nums">- {formatBRL(p.discount_amount)}</span>
                </div>
              )}
              {num(p.shipping_amount) > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Frete</span>
                  <span className="tabular-nums">{formatBRL(p.shipping_amount)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-0.5">
                <span className="text-sm font-medium">Total</span>
                <span className="text-xl font-bold tabular-nums" style={{ color: cor }}>
                  {formatBRL(p.total)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Condições */}
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <CreditCard className="h-4 w-4" style={{ color: cor }} /> Pagamento
              </p>
              <p className="mt-1 text-sm">
                {rotuloForma(p.payment_method)} ·{" "}
                {parcelas.length > 1 ? `${parcelas.length} parcelas` : "parcela única"}
              </p>
              {p.payment_terms && <p className="mt-0.5 text-sm text-muted-foreground">{p.payment_terms}</p>}
              {parcelas.length > 0 && (
                <ul className="mt-2 divide-y rounded-lg border text-sm">
                  {parcelas.map((x) => (
                    <li key={x.numero} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="text-muted-foreground">
                        {x.numero}/{parcelas.length} ·{" "}
                        {x.dias === 0 ? "na aprovação" : `${x.dias} dias após a aprovação`}
                      </span>
                      <span className="font-medium tabular-nums">{formatBRL(x.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {(p.delivery_date || p.delivery_terms) && (
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Truck className="h-4 w-4" style={{ color: cor }} /> Entrega
                </p>
                {p.delivery_date && <p className="mt-1 text-sm">Previsão: {dataBR(p.delivery_date)}</p>}
                {p.delivery_terms && <p className="mt-0.5 text-sm text-muted-foreground">{p.delivery_terms}</p>}
              </div>
            )}
            {p.notes && (
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <ClipboardCheck className="h-4 w-4" style={{ color: cor }} /> Observações
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quem atende e quem vende */}
        <div className="grid gap-4 sm:grid-cols-2">
          {rep && (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs text-muted-foreground">Seu representante</p>
                <p className="mt-0.5 font-semibold">{rep.name}</p>
                <div className="mt-2 flex flex-col gap-1.5 text-sm">
                  {rep.phone && (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> {rep.phone}
                    </span>
                  )}
                  {rep.email && (
                    <a href={`mailto:${rep.email}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:underline">
                      <Mail className="h-3.5 w-3.5" /> {rep.email}
                    </a>
                  )}
                </div>
                {linkWhats && telRep.length >= 10 && (
                  <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                    <a href={linkWhats} target="_blank" rel="noreferrer">
                      <MessageCircle className="mr-1.5 h-4 w-4 text-emerald-600" /> Falar no WhatsApp
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          <Card className={rep ? "" : "sm:col-span-2"}>
            <CardContent className="p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Fornecedor</p>
              <p className="mt-0.5 font-semibold">{loja}</p>
              <dl className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {marca?.cnpj && <p>CNPJ {formatarDocumento(marca.cnpj)}</p>}
                {marca?.address && <p>{marca.address}</p>}
                {marca?.phone && <p>{marca.phone}</p>}
              </dl>
              {linkWhats && telRep.length < 10 && (
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <a href={linkWhats} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-1.5 h-4 w-4 text-emerald-600" /> Falar no WhatsApp
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {cliente && (cliente.company_name || cliente.document) && (
          <p className="text-center text-xs text-muted-foreground">
            Proposta para {cliente.company_name || cliente.name}
            {cliente.document ? ` · ${formatarDocumento(cliente.document)}` : ""}
          </p>
        )}
        <p className="text-center text-[11px] text-muted-foreground">
          Proposta {p.number} emitida por {loja} · via Velara
        </p>
      </main>

      {/* Barra de resposta: o próximo passo não pode ficar escondido no fim da página */}
      {aberta && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <div className="hidden min-w-0 flex-1 sm:block">
              <p className="text-[11px] leading-none text-muted-foreground">Total da proposta</p>
              <p className="truncate text-lg font-bold tabular-nums">{formatBRL(p.total)}</p>
            </div>
            <Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => setDialogo("recusar")}>
              Recusar
            </Button>
            <Button
              size="lg"
              className="flex-[2] text-white hover:opacity-90 sm:flex-none"
              style={{ backgroundColor: cor }}
              onClick={() => setDialogo("aprovar")}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Aprovar proposta
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogo === "aprovar"} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar a proposta {p.number}</DialogTitle>
            <DialogDescription>
              Ao aprovar, {loja} recebe o seu pedido de {formatBRL(p.total)} nas condições desta proposta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nome-aprovador">Seu nome</Label>
              <Input
                id="nome-aprovador"
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value.slice(0, 120))}
                placeholder="Nome de quem está aprovando"
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={concordo} onCheckedChange={(v) => setConcordo(v === true)} className="mt-0.5" />
              <span>Conferi os itens, os valores e as condições de pagamento e entrega.</span>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={respondendo}>
              Voltar
            </Button>
            <Button
              className="text-white hover:opacity-90"
              style={{ backgroundColor: cor }}
              disabled={!nome.trim() || !concordo || respondendo}
              onClick={() => responder(true)}
            >
              {respondendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Confirmar aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === "recusar"} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar a proposta {p.number}</DialogTitle>
            <DialogDescription>Conte o motivo, se quiser: ajuda a mandar uma proposta melhor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nome-recusa">Seu nome</Label>
              <Input
                id="nome-recusa"
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value.slice(0, 120))}
                placeholder="Nome de quem está respondendo"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="motivo-recusa">Motivo (opcional)</Label>
              <Textarea
                id="motivo-recusa"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value.slice(0, 500))}
                placeholder="Ex.: preço acima do esperado, prazo de entrega longo"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={respondendo}>
              Voltar
            </Button>
            <Button variant="destructive" disabled={!nome.trim() || respondendo} onClick={() => responder(false)}>
              {respondendo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Recusar proposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
