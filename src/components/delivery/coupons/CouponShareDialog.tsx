import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  url: string;
}

export function CouponShareDialog({ open, onOpenChange, code, url }: Props) {
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const handleDownload = () => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `cupom-${code}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(
      `Use o cupom ${code} no nosso cardápio: ${url}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar cupom {code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div ref={canvasWrapRef} className="flex justify-center p-6 bg-card border rounded-md">
            <QRCodeCanvas value={url} size={220} level="M" includeMargin />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Link compartilhável</label>
            <div className="flex gap-2">
              <Input value={url} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={handleCopy}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" /> Baixar QR
            </Button>
            <Button onClick={handleWhatsApp}>
              <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
