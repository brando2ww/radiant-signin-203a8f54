import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, ExternalLink, QrCode as QrCodeIcon, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import {
  buildPublicMenuUrl,
  buildShareableMenuUrl,
} from "@/lib/public-menu-link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const PublicMenuLink = () => {
  const { user } = useAuth();
  const { settings } = useBusinessSettings();
  const [showQR, setShowQR] = useState(false);

  const slug = settings?.slug || null;
  const publicUrl = user
    ? buildPublicMenuUrl({ userId: user.id, slug })
    : "";
  const shareableUrl = user
    ? buildShareableMenuUrl({ userId: user.id, slug })
    : "";

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiado!`);
  };

  const handleOpenLink = () => {
    window.open(publicUrl, "_blank");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Link Público do Cardápio</CardTitle>
          <CardDescription>
            Compartilhe este link com seus clientes para que eles possam fazer pedidos online
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Link direto do cardápio
            </label>
            <div className="flex gap-2 mt-1">
              <Input value={publicUrl} readOnly className="font-mono text-sm" />
              <Button
                onClick={() => handleCopy(publicUrl, "Link")}
                variant="outline"
                size="icon"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button onClick={handleOpenLink} variant="outline" size="icon">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            {!slug && (
              <p className="text-xs text-muted-foreground mt-2">
                Dica: configure um link personalizado em "Personalização" para um endereço mais curto.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Share2 className="h-3 w-3" /> Link para compartilhar (com prévia do logo)
            </label>
            <div className="flex gap-2 mt-1">
              <Input value={shareableUrl} readOnly className="font-mono text-sm" />
              <Button
                onClick={() => handleCopy(shareableUrl, "Link de compartilhamento")}
                variant="outline"
                size="icon"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Use este link no WhatsApp, Instagram e redes sociais. Ele mostra o logo e o nome do seu negócio na prévia da mensagem antes de redirecionar para o cardápio.
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setShowQR(true)} className="flex-1">
              <QrCodeIcon className="h-4 w-4 mr-2" />
              Ver QR Code
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code do Cardápio</DialogTitle>
            <DialogDescription>
              Seus clientes podem escanear este código para acessar seu cardápio
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG value={publicUrl} size={256} level="H" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Salve a imagem ou imprima para usar em seus materiais
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
