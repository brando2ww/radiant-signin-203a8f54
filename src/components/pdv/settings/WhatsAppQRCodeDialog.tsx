import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, RefreshCw, Smartphone, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneInput } from "@/components/ui/phone-input";
import { useWhatsAppConnection } from "@/hooks/use-whatsapp-connection";

interface WhatsAppQRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogStep = 'form' | 'generating' | 'qrcode' | 'connected';

export function WhatsAppQRCodeDialog({ open, onOpenChange }: WhatsAppQRCodeDialogProps) {
  const {
    connection, isConnected, qrCode, pairingCode, isPolling, pollError,
    isGenerating, isDisconnecting,
    generateQRCode, disconnect, stopPolling, setQrCode, setPollError
  } = useWhatsAppConnection();

  const [connectionName, setConnectionName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [step, setStep] = useState<DialogStep>('form');

  const handleClose = () => {
    stopPolling();
    setQrCode(null);
    setPollError(null);
    setStep('form');
    setConnectionName("");
    setPhoneNumber("");
    onOpenChange(false);
  };

  const handleSubmitForm = () => {
    if (!connectionName.trim() || connectionName.length < 3) return;
    if (!phoneNumber.trim() || phoneNumber.replace(/\D/g, '').length < 10) return;
    setStep('generating');
    setPollError(null);
    generateQRCode({ connectionName: connectionName.trim(), phoneNumber });
  };

  const handleGenerateNew = () => {
    setQrCode(null);
    setPollError(null);
    setStep('generating');
    generateQRCode({ connectionName: connectionName.trim(), phoneNumber });
  };

  // Update step when QR code is received
  if ((qrCode || pairingCode) && step === 'generating') {
    setStep('qrcode');
  }

  // Connection success view
  if (isConnected || (connection?.connection_status === 'open')) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className="h-5 w-5" />
              WhatsApp Conectado
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-6 py-6">
            <div className="rounded-full bg-primary/10 p-4">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
            <p className="text-center text-lg font-medium">WhatsApp conectado com sucesso!</p>
            {connection && (
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={connection.profile_picture_url || undefined} />
                  <AvatarFallback><Smartphone className="h-6 w-6" /></AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{connection.profile_name || connection.connection_name || 'WhatsApp'}</p>
                  {connection.phone_number && (
                    <p className="text-sm text-muted-foreground">+{connection.phone_number}</p>
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2 w-full">
              <Button onClick={handleClose} className="w-full">Concluir</Button>
              <Button
                variant="outline"
                onClick={() => disconnect()}
                disabled={isDisconnecting}
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {isDisconnecting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Desconectando...</>) : 'Desconectar WhatsApp'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Form view
  if (step === 'form') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className="h-5 w-5" />
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription>Preencha os dados para criar sua conexão</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="connection-name">Nome da conexão</Label>
              <Input id="connection-name" placeholder="Ex: Loja Principal" value={connectionName} onChange={(e) => setConnectionName(e.target.value)} />
              <p className="text-xs text-muted-foreground">Um nome para identificar esta conexão</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone-number">Número do WhatsApp</Label>
              <PhoneInput value={phoneNumber} onChange={setPhoneNumber} />
              <p className="text-xs text-muted-foreground">O número que será conectado</p>
            </div>
            <Button
              onClick={handleSubmitForm}
              disabled={!connectionName.trim() || connectionName.length < 3 || phoneNumber.replace(/\D/g, '').length < 10}
              className="w-full gap-2 mt-2"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Conectar WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Generating view
  if (step === 'generating' && !qrCode && !pairingCode && !pollError) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className="h-5 w-5" />
              Conectar WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-center text-muted-foreground">Criando instância e gerando QR Code...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // QR Code / Error view
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="h-5 w-5" />
            Conectar WhatsApp
          </DialogTitle>
          {!pollError && (
            <DialogDescription>Escaneie o QR Code com seu WhatsApp para conectar</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Error / Stale state */}
          {pollError ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>
              <p className="text-center text-sm text-muted-foreground">{pollError}</p>
              <Button onClick={handleGenerateNew} disabled={isGenerating} className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Gerar novo QR Code
              </Button>
            </div>
          ) : (
            <>
              {/* QR Code Display */}
              <div className="relative flex h-64 w-64 items-center justify-center rounded-lg border-2 border-dashed bg-yellow-400">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-2 rounded-lg bg-white/80 p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                  </div>
                ) : qrCode ? (
                  <img
                    src={`data:image/png;base64,${qrCode}`}
                    alt="QR Code WhatsApp"
                    className="h-full w-full object-contain p-2 mix-blend-screen"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <WhatsAppIcon className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Erro ao gerar QR Code</p>
                  </div>
                )}
              </div>

              {isPolling && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Aguardando conexão...</span>
                </div>
              )}

              <div className="w-full space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
                <p className="font-medium">Como conectar:</p>
                <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                  <li>Abra o WhatsApp no seu celular</li>
                  <li>Toque em <span className="font-medium">Configurações</span> → <span className="font-medium">Dispositivos conectados</span></li>
                  <li>Toque em <span className="font-medium">Conectar um dispositivo</span></li>
                  <li>Aponte a câmera para este QR Code</li>
                </ol>
              </div>

              {/* Caminho alternativo. O WhatsApp passou a pedir confirmação por
                  chave de acesso ao autorizar dispositivo pelo QR, e tem celular
                  que não fecha a conexão por ali. O código sempre veio na mesma
                  resposta do servidor, só não era exibido. */}
              {pairingCode && (
                <div className="w-full space-y-2 rounded-lg border border-dashed p-4 text-sm">
                  <p className="font-medium">O QR não funcionou? Use o código:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-center text-lg font-bold tracking-[0.2em]">
                      {pairingCode}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Copiar código"
                      onClick={() => {
                        navigator.clipboard.writeText(pairingCode);
                        toast.success("Código copiado");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                    <li>Na mesma tela, toque em <span className="font-medium">Vincular com número de telefone</span></li>
                    <li>Digite o código acima</li>
                  </ol>
                </div>
              )}

              {qrCode && (
                <p className="text-xs text-muted-foreground">O QR Code expira em 2 minutos</p>
              )}

              <div className="flex w-full gap-2">
                {qrCode && (
                  <Button variant="outline" onClick={handleGenerateNew} disabled={isGenerating} className="w-full gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Gerar novo QR Code
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
