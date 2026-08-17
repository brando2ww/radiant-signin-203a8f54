import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle2, ExternalLink, Smartphone, Loader2, Webhook } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useWhatsAppConnection } from "@/hooks/use-whatsapp-connection";
import { WhatsAppQRCodeDialog } from "./WhatsAppQRCodeDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function WhatsAppConnectionCard() {
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);
  const {
    connection,
    isLoading,
    isConnected,
    isDisconnecting,
    disconnect,
    connectSellGrid,
    isConnectingSellGrid,
  } = useWhatsAppConnection();

  // O webhook de entrada é do Evolution: no número da Velara as respostas ficam
  // no atendimento da SellGrid, então o botão não faz sentido ali.
  const isSellGrid = connection?.provider === 'sellgrid';

  const handleRegisterWebhook = async () => {
    setIsRegisteringWebhook(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-whatsapp-webhook");
      if (error) throw error;
      if (data?.code === "NO_WHATSAPP_CONNECTION") {
        toast.error("Nenhuma conexão WhatsApp ativa encontrada.");
        return;
      }
      toast.success(`Webhook configurado com sucesso para "${data?.instanceName}"!`);
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Erro ao configurar webhook";
      toast.error(message);
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <WhatsAppIcon className="h-5 w-5 text-green-500" />
              <h3 className="font-semibold text-lg">WhatsApp Business</h3>
              {isConnected ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="secondary">Desconectado</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {isConnected 
                ? "Seu WhatsApp está conectado ao sistema"
                : "Conecte seu WhatsApp para enviar cotações e pedidos diretamente pelo sistema"
              }
            </p>
          </div>
          
          {isConnected ? (
            <div className="flex items-center gap-2">
              {!isSellGrid && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegisterWebhook}
                disabled={isRegisteringWebhook}
                title="Registrar/atualizar webhook para receber respostas de fornecedores"
              >
                {isRegisteringWebhook ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Configurando...
                  </>
                ) : (
                  <>
                    <Webhook className="mr-2 h-4 w-4" />
                    Configurar Webhook
                  </>
                )}
              </Button>
              )}
              <Button
                variant="outline"
                onClick={() => disconnect()}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Desconectando...
                  </>
                ) : (
                  "Desconectar"
                )}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Duas formas de enviar, e a diferença entre elas não é técnica: é de
            quem aparece como remetente e para onde vai a resposta. */}
        {!isConnected && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3 space-y-2">
              <p className="font-medium text-sm">Número oficial da Velara</p>
              <p className="text-xs text-muted-foreground">
                Ativa na hora, sem QR Code e sem usar o celular do restaurante. Indicado para
                disparo em massa de cotações.
              </p>
              <p className="text-xs text-amber-700">
                O fornecedor recebe do número da Velara · se ele responder no WhatsApp, a
                resposta não chega aqui. Para cotação isso não atrapalha, porque ele responde
                pelo link do formulário.
              </p>
              <Button
                size="sm"
                className="w-full"
                onClick={() => connectSellGrid()}
                disabled={isConnectingSellGrid}
              >
                {isConnectingSellGrid ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ativando...
                  </>
                ) : (
                  "Ativar número da Velara"
                )}
              </Button>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="font-medium text-sm">Seu próprio número (QR Code)</p>
              <p className="text-xs text-muted-foreground">
                O fornecedor recebe do número do restaurante e a resposta chega no seu
                WhatsApp. Exige ler o QR Code e manter o celular conectado.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setShowQRDialog(true)}
              >
                <ExternalLink className="h-4 w-4" />
                Conectar por QR Code
              </Button>
            </div>
          </div>
        )}

        {isConnected && connection && (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={connection.profile_picture_url || undefined} />
              <AvatarFallback>
                <Smartphone className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">{connection.profile_name || 'WhatsApp'}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {connection.phone_number && (
                  <span>+{connection.phone_number}</span>
                )}
                {connection.connected_at && (
                  <>
                    <span>•</span>
                    <span>
                      Conectado em {format(new Date(connection.connected_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          • Envie cotações para fornecedores via WhatsApp<br />
          • Receba confirmações de pedidos<br />
          • Comunique-se diretamente pelo sistema
        </div>
      </div>

      <WhatsAppQRCodeDialog 
        open={showQRDialog} 
        onOpenChange={setShowQRDialog} 
      />
    </>
  );
}
