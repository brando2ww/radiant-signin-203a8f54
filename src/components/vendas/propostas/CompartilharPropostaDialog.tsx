import { useEffect, useState } from "react";
import { Copy, Loader2, Mail, MessageCircle, Send, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format";
import { generateWhatsAppLink } from "@/lib/whatsapp-message";
import { enviarPelaLoja } from "@/hooks/use-vendas-propostas";
import type { VendasCliente } from "@/lib/vendas/types";
import { dataBR, nomeCliente, soDigitos } from "./calculos";

export const linkPublicoDaProposta = (token: string) => `${window.location.origin}/proposta/${token}`;

export function mensagemDaProposta(opts: {
  cliente: Partial<VendasCliente> | null;
  numero: string;
  total: number;
  validade: string | null;
  loja: string | null;
  link: string;
}) {
  const quem = (opts.cliente?.contact_name || nomeCliente(opts.cliente)).split(" ")[0];
  const linhas = [
    `Olá, ${quem}! Tudo bem?`,
    "",
    `Segue a proposta ${opts.numero}${opts.loja ? ` da ${opts.loja}` : ""}, no total de ${formatBRL(opts.total)}${
      opts.validade ? `, válida até ${dataBR(opts.validade)}` : ""
    }.`,
    "",
    "Pelo link você confere os itens, baixa o PDF e aprova com um clique:",
    opts.link,
  ];
  return linhas.join("\n");
}

/** Depois de enviar: link público, WhatsApp do cliente pelo celular de quem vende e, se existir, envio pela loja. */
export function CompartilharPropostaDialog({
  open,
  onOpenChange,
  propostaId,
  numero,
  token,
  total,
  validade,
  cliente,
  loja,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propostaId: string;
  numero: string;
  token: string;
  total: number;
  validade: string | null;
  cliente: Partial<VendasCliente> | null;
  loja: string | null;
}) {
  const link = linkPublicoDaProposta(token);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState<null | "whatsapp" | "email">(null);
  const telefone = soDigitos(cliente?.whatsapp || cliente?.phone);

  useEffect(() => {
    if (open) setMensagem(mensagemDaProposta({ cliente, numero, total, validade, loja, link }));
    // Só ao abrir: a pessoa pode ter editado a mensagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie à mão.");
    }
  };

  const abrirWhatsApp = () => {
    const url = telefone.length >= 10
      ? generateWhatsAppLink(telefone, mensagem)
      : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank", "noopener");
  };

  const pelaLoja = async (canal: "whatsapp" | "email") => {
    setEnviando(canal);
    try {
      const r = await enviarPelaLoja(propostaId, canal);
      if (r.ok) toast.success(r.message || (canal === "email" ? "E-mail enviado ao cliente" : "Mensagem enviada pelo WhatsApp da loja"));
      else toast.error(r.message || "Não foi possível enviar pela loja.");
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar a proposta {numero}</DialogTitle>
          <DialogDescription>
            O cliente abre o link sem senha, vê os itens, baixa o PDF e aprova. Quando ele abrir, a proposta mostra "visto pelo cliente".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="link-proposta">Link da proposta</Label>
          <div className="flex gap-2">
            <Input id="link-proposta" readOnly value={link} className="min-w-0 font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" onClick={copiar} className="shrink-0">
              <Copy className="mr-1.5 h-4 w-4" /> Copiar
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="msg-proposta">Mensagem</Label>
          <Textarea id="msg-proposta" rows={7} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className="text-sm" />
        </div>

        <Button type="button" className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={abrirWhatsApp}>
          <MessageCircle className="mr-2 h-4 w-4" />
          {telefone.length >= 10 ? `Abrir no WhatsApp · ${cliente?.whatsapp || cliente?.phone}` : "Abrir no WhatsApp"}
        </Button>

        <div className="rounded-lg border p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Store className="h-4 w-4 text-muted-foreground" /> Enviar pela loja
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sai do WhatsApp ou do e-mail da empresa, com o link da proposta.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" size="sm" disabled={!!enviando || telefone.length < 10} onClick={() => pelaLoja("whatsapp")}>
              {enviando === "whatsapp" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              WhatsApp da loja
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!!enviando || !cliente?.email} onClick={() => pelaLoja("email")}>
              {enviando === "email" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
              E-mail{cliente?.email ? "" : " (sem e-mail)"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
