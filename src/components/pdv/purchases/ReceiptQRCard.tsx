import { useRef, useState } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Printer, RefreshCw, Copy, QrCode, Download, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useReceiptLink } from "@/hooks/use-receipt-link";
import { useBusinessSettings } from "@/hooks/use-business-settings";

/** Passo a passo mostrado na tela E no papel impresso — a mesma verdade nos dois. */
const STEPS = [
  "Aponte a câmera do celular para o código.",
  "Escolha o pedido que chegou.",
  "Confira item a item e ajuste o que veio diferente.",
  "Confirme com a sua senha do caixa.",
];

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

/**
 * QR fixo do recebimento: baixe ou imprima, cole na doca, e quem recebe a
 * mercadoria confere pelo celular — sem app e sem login.
 */
export function ReceiptQRCard() {
  const { link, receiptUrl, isLoading, rotate } = useReceiptLink();
  const { settings } = useBusinessSettings();
  const svgRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [password, setPassword] = useState("");

  const businessName = settings?.business_name || "";

  // O PNG sai do canvas escondido em alta resolução: o QR da tela (148px) fica
  // borrado se for parar numa impressora ou num grupo de WhatsApp.
  const handleDownload = () => {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-recebimento${businessName ? `-${slug(businessName)}` : ""}.png`;
    a.click();
    toast.success("QR baixado. Imprima e cole onde a mercadoria chega.");
  };

  const handlePrint = () => {
    if (!receiptUrl) return;
    const svg = svgRef.current?.querySelector("svg");
    if (!svg) return;
    const win = window.open("", "_blank", "width=700,height=900");
    if (!win) {
      toast.error("Não foi possível abrir a janela de impressão.");
      return;
    }
    const esc = (s: string) =>
      s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>QR de Recebimento</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 40px 24px; }
        h1 { font-size: 24px; margin: 0 0 4px; }
        .biz { color: #555; margin: 0 0 28px; font-size: 15px; }
        .qr { display: inline-block; padding: 16px; border: 2px solid #111; border-radius: 12px; }
        ol { text-align: left; max-width: 380px; margin: 30px auto 0; color: #333; font-size: 14px; line-height: 1.8; }
        .foot { margin-top: 26px; font-size: 12px; color: #777; }
        @media print { @page { margin: 12mm; } }
      </style></head><body>
      <h1>Recebimento de mercadoria</h1>
      <p class="biz">${esc(businessName)}</p>
      <div class="qr">${svg.outerHTML}</div>
      <ol>${STEPS.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      <p class="foot">Confirmar o recebimento exige a senha de um operador.</p>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  const handleRotate = () => {
    if (!password) return;
    rotate.mutate(password, {
      onSuccess: () => {
        setRotateOpen(false);
        setPassword("");
      },
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!link) {
    return (
      <Card>
        <CardContent className="p-5 sm:flex sm:items-center sm:gap-5">
          <div className="flex-1">
            <h3 className="flex items-center gap-2 font-semibold">
              <QrCode className="h-4 w-4 text-primary" />
              Recebimento por QR code
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Gere um QR para colar onde a mercadoria chega. Quem recebe confere o pedido
              pelo celular e dá baixa no estoque na hora — sem instalar nada e sem login.
            </p>
          </div>
          <Button
            className="mt-4 w-full sm:mt-0 sm:w-auto"
            onClick={() => rotate.mutate()}
            disabled={rotate.isPending}
          >
            {rotate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="mr-2 h-4 w-4" />
            )}
            Gerar QR de recebimento
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          {/* QR + ações */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div ref={svgRef} className="rounded-lg border bg-white p-3">
              <QRCodeSVG value={receiptUrl!} size={150} level="H" />
            </div>

            {/* Fonte do PNG: alta resolução, fora da tela. */}
            <div ref={canvasRef} className="pointer-events-none absolute -left-[9999px] top-0" aria-hidden>
              <QRCodeCanvas value={receiptUrl!} size={1024} level="H" marginSize={2} />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Baixar
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
            </div>
          </div>

          {/* Instruções */}
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <QrCode className="h-4 w-4 text-primary" />
                Recebimento por QR code
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                <strong>Baixe ou imprima</strong> este código e cole onde a mercadoria chega.
                Quem recebe não precisa de login nem de aplicativo: aponta a câmera e confere.
              </p>
            </div>

            <ol className="space-y-1.5 text-sm">
              {STEPS.map((s, i) => (
                <li key={s} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{s}</span>
                </li>
              ))}
            </ol>

            <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                Quem tiver o QR consegue <strong>ver</strong> os pedidos em aberto e seus valores.
                Para <strong>confirmar</strong> um recebimento é preciso a senha de um operador
                ativo, e a baixa fica assinada com o nome de quem conferiu. Se o papel vazar,
                gere um novo QR.
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(receiptUrl!);
                  toast.success("Link copiado!");
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar link
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRotateOpen(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Gerar novo QR
              </Button>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Regerar exige senha: um clique solto derruba o QR já impresso. */}
      <Dialog
        open={rotateOpen}
        onOpenChange={(o) => {
          setRotateOpen(o);
          if (!o) setPassword("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Gerar um novo QR?
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
              O QR que já está <strong>impresso e colado</strong> vai parar de funcionar na hora.
              Quem apontar a câmera nele verá "QR inválido" até você imprimir e colar o novo.
              Faça isso se o código vazou.
            </p>

            <div className="space-y-2">
              <Label className="text-xs">Senha de gerente</Label>
              <Input
                type="password"
                inputMode="numeric"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && password && handleRotate()}
                className="h-11 text-center text-lg tracking-widest"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setRotateOpen(false)} disabled={rotate.isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRotate} disabled={!password || rotate.isPending}>
              {rotate.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Gerar novo QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
