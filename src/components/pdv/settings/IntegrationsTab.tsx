import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Link2, ExternalLink, CheckCircle2, AlertCircle, FileDown, RefreshCw, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppConnectionCard } from "./WhatsAppConnectionCard";
import { usePDVSettings } from "@/hooks/use-pdv-settings";
import { toast } from "sonner";

export function IntegrationsTab() {
  const { settings: pdvSettings, updateSettings: updatePDVSettings, isUpdating, isLoading } = usePDVSettings();
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
      {/* A conexão do iFood mora em /pdv/integracoes/ifood. Este arquivo tinha
          uma segunda cópia da mesma tela, com o mesmo hook por trás: duas telas
          divergindo é como o passivo do iFood cresceu. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            iFood
          </CardTitle>
          <CardDescription>
            A conexão com o iFood foi para a página de Integrações, onde ficam o
            vínculo das lojas, o teste de conexão e o log de eventos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" asChild>
            <Link to="/pdv/integracoes/ifood">
              Abrir integração do iFood
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
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
                  const cnpj = nfeCnpj || pdvSettings?.nfe_auto_import_cnpj || "";
                  if (!cnpj.trim()) {
                    toast.error("Informe um CNPJ válido");
                    return;
                  }
                  updatePDVSettings({ nfe_auto_import_cnpj: cnpj });
                }}
              >
                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

    </div>
  );
}
