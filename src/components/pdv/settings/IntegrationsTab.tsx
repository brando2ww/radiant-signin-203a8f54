import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Link2, ExternalLink, CheckCircle2, AlertCircle, FileDown, RefreshCw, Loader2 } from "lucide-react";
import { useIFoodIntegration } from "@/hooks/use-ifood-integration";
import { IFoodConnectionDialog } from "./IFoodConnectionDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppConnectionCard } from "./WhatsAppConnectionCard";
import { usePDVSettings } from "@/hooks/use-pdv-settings";
import { toast } from "sonner";

export function IntegrationsTab() {
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const { settings, isLoading, isConnected, disconnectIFood, updateSettings, syncReviews } = useIFoodIntegration();
  const { settings: pdvSettings, updateSettings: updatePDVSettings, isUpdating } = usePDVSettings();
  const [nfeCnpj, setNfeCnpj] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            iFood
          </CardTitle>
          <CardDescription>
            Gerencie sua conexão com o iFood
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">iFood</h3>
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
                  Receba pedidos do iFood diretamente no seu PDV
                </p>
                {isConnected && settings?.ifood_merchant_id && (
                  <p className="text-xs text-muted-foreground">
                    ID do Estabelecimento: {settings.ifood_merchant_id}
                  </p>
                )}
              </div>
              {isConnected ? (
                <Button
                  variant="outline"
                  onClick={() => disconnectIFood.mutate()}
                  disabled={disconnectIFood.isPending}
                >
                  {disconnectIFood.isPending ? "Desconectando..." : "Desconectar"}
                </Button>
              ) : (
                <Button onClick={() => setShowConnectionDialog(true)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Conectar
                </Button>
              )}
            </div>

            {isConnected && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ifood-auto-accept" className="text-sm">
                    Aceitar pedidos automaticamente
                  </Label>
                  <Switch
                    id="ifood-auto-accept"
                    checked={settings?.ifood_auto_accept || false}
                    onCheckedChange={(checked) =>
                      updateSettings.mutate({ ifood_auto_accept: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="ifood-sync-menu" className="text-sm">
                    Sincronizar cardápio automaticamente
                  </Label>
                  <Switch
                    id="ifood-sync-menu"
                    checked={settings?.ifood_sync_menu || false}
                    onCheckedChange={(checked) =>
                      updateSettings.mutate({ ifood_sync_menu: checked })
                    }
                  />
               </div>
               
               <div className="pt-2">
                 <Button
                   variant="outline"
                   size="sm"
                   className="w-full"
                   onClick={() => syncReviews.mutate()}
                   disabled={syncReviews.isPending}
                 >
                   <RefreshCw className={`mr-2 h-4 w-4 ${syncReviews.isPending ? "animate-spin" : ""}`} />
                   {syncReviews.isPending ? "Sincronizando..." : "Sincronizar Avaliações do iFood"}
                 </Button>
               </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              • Sincronização automática de cardápio<br />
              • Recebimento de pedidos em tempo real<br />
              • Atualização de status automaticamente
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NF-e Auto Import Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileDown className="h-5 w-5" />
                Importar NF-e Automaticamente
              </CardTitle>
              <CardDescription>
                Busque automaticamente notas fiscais emitidas contra o CNPJ do seu estabelecimento via SEFAZ
              </CardDescription>
            </div>
            <Switch
              checked={pdvSettings?.nfe_auto_import_enabled || false}
              onCheckedChange={(checked) =>
                updatePDVSettings({
                  nfe_auto_import_enabled: checked,
                  nfe_auto_import_cnpj: nfeCnpj || pdvSettings?.nfe_auto_import_cnpj || pdvSettings?.business_cnpj || "",
                })
              }
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pdvSettings?.nfe_auto_import_enabled && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nfe-cnpj">CNPJ para consulta</Label>
                <Input
                  id="nfe-cnpj"
                  placeholder="00.000.000/0000-00"
                  value={nfeCnpj || pdvSettings?.nfe_auto_import_cnpj || pdvSettings?.business_cnpj || ""}
                  onChange={(e) => setNfeCnpj(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                disabled={isUpdating}
                onClick={() => {
                  updatePDVSettings({
                    nfe_auto_import_cnpj: nfeCnpj || pdvSettings?.nfe_auto_import_cnpj || "",
                  });
                }}
              >
                Salvar CNPJ
              </Button>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            • Consulta automática de NF-e na SEFAZ<br />
            • Importa XML completo com itens e impostos<br />
            • NF-e novas aparecem na tela de Notas Fiscais
          </div>
        </CardContent>
      </Card>

      <IFoodConnectionDialog
        open={showConnectionDialog}
        onOpenChange={setShowConnectionDialog}
      />
    </div>
  );
}
