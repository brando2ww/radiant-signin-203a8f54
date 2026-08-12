import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  RefreshCw,
  Store,
  Unlink,
  WifiOff,
} from "lucide-react";
import { useIFoodIntegration, type IFoodAvailableMerchant } from "@/hooks/use-ifood-integration";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Conexão do iFood, no padrão do card da DeliveryMuch: estado real, teste de
// conexão com resposta visível e log dos últimos eventos. Nada de switch que
// grava coluna sem consumidor, que era o que o card anterior fazia.

function quando(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export function IFoodIntegrationCard() {
  const {
    status,
    isLoading,
    pollingHealthy,
    availableMerchants,
    linkMerchant,
    unlinkMerchant,
    selectMerchant,
    testConnection,
    updateSettings,
  } = useIFoodIntegration();

  const [candidatas, setCandidatas] = useState<IFoodAvailableMerchant[] | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  const settings = status?.settings;
  const merchants = status?.merchants ?? [];
  const platform = status?.platform ?? null;
  const conectado = Boolean(status?.connected);

  const buscar = async () => {
    const r = await availableMerchants.mutateAsync();
    setCandidatas(r.merchants);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                iFood
                {conectado
                  ? <Badge className="bg-green-600 hover:bg-green-600">Conectado</Badge>
                  : <Badge variant="secondary">Sem loja vinculada</Badge>}
              </CardTitle>
              <CardDescription>
                Pedidos do iFood entram direto na tela de Delivery do Velara.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConnection.mutate()}
              disabled={!conectado || testConnection.isPending}
            >
              {testConnection.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Testar conexão</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Saúde do polling. Sem polling recente o iFood considera o
              aplicativo OFFLINE e TODAS as lojas saem do ar na plataforma, então
              isso não pode ficar escondido num log. */}
          {conectado && !pollingHealthy && (
            <Alert variant="destructive">
              <WifiOff className="h-4 w-4" />
              <AlertTitle>Aplicativo offline no iFood</AlertTitle>
              <AlertDescription>
                A integração precisa consultar o iFood a cada 30 segundos para a loja
                continuar no ar. Última consulta: {quando(platform?.last_poll_at)}.
              </AlertDescription>
            </Alert>
          )}

          {settings?.ifood_last_error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Último erro</AlertTitle>
              <AlertDescription>
                {settings.ifood_last_error}
                <span className="block text-xs opacity-80">
                  em {quando(settings.ifood_last_error_at)}
                </span>
              </AlertDescription>
            </Alert>
          )}

          {/* Lojas vinculadas */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Lojas desta conta</Label>

            {merchants.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma loja vinculada ainda. Autorize a Velara no Portal do Parceiro do
                iFood e depois busque as lojas disponíveis aqui.
              </p>
            )}

            {merchants.map((m) => {
              const emFoco = settings?.ifood_merchant_id === m.merchant_id;
              return (
                <div
                  key={m.merchant_id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{m.name ?? m.merchant_id}</span>
                      {emFoco && <Badge variant="outline">Em foco</Badge>}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {m.merchant_id}
                    </p>
                    {m.last_status_at && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Status consultado em {quando(m.last_status_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!emFoco && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => selectMerchant.mutate(m.merchant_id)}
                      >
                        Focar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unlinkMerchant.mutate(m.merchant_id)}
                      disabled={unlinkMerchant.isPending}
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              onClick={buscar}
              disabled={availableMerchants.isPending}
            >
              {availableMerchants.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Link2 className="h-4 w-4" />}
              <span className="ml-2">Buscar lojas disponíveis</span>
            </Button>

            {candidatas && candidatas.filter((c) => !c.linked).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma loja nova disponível. Se a sua loja não aparece, ela ainda não
                autorizou a Velara no Portal do Parceiro do iFood.
              </p>
            )}

            {candidatas?.filter((c) => !c.linked).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{c.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{c.id}</p>
                </div>
                <Button size="sm" onClick={() => linkMerchant.mutate(c.id)} disabled={linkMerchant.isPending}>
                  Vincular
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Operação */}
      {conectado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ifood-shadow" className="text-sm">Modo sombra</Label>
                <p className="text-xs text-muted-foreground">
                  Recebe e mostra o pedido no Velara, mas não confirma no iFood. Use na estreia.
                </p>
              </div>
              <Switch
                id="ifood-shadow"
                checked={settings?.ifood_shadow_mode ?? true}
                onCheckedChange={(v) => updateSettings.mutate({ ifood_shadow_mode: v })}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ifood-pause" className="text-sm">Pausar recebimento</Label>
                <p className="text-xs text-muted-foreground">
                  Para de processar pedidos sem desvincular a loja.
                </p>
              </div>
              <Switch
                id="ifood-pause"
                checked={settings?.ifood_paused ?? false}
                onCheckedChange={(v) => updateSettings.mutate({ ifood_paused: v })}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ifood-auto" className="text-sm">Confirmar pedidos automaticamente</Label>
                <p className="text-xs text-muted-foreground">
                  Confirma no iFood assim que o pedido chega, sem depender do operador.
                </p>
              </div>
              <Switch
                id="ifood-auto"
                checked={settings?.ifood_auto_accept ?? false}
                onCheckedChange={(v) => updateSettings.mutate({ ifood_auto_accept: v })}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ifood-cashier" className="text-sm">Exigir caixa aberto</Label>
                <p className="text-xs text-muted-foreground">
                  Não confirma pedido quando não há ninguém operando o caixa.
                </p>
              </div>
              <Switch
                id="ifood-cashier"
                checked={settings?.ifood_require_open_cashier ?? true}
                onCheckedChange={(v) => updateSettings.mutate({ ifood_require_open_cashier: v })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Últimos eventos: é o que explica uma falha sem precisar abrir o banco */}
      {(status?.logs?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos eventos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {status!.logs.map((l, i) => (
              <div key={i} className="flex items-start gap-2 border-b py-1.5 text-xs last:border-0">
                {l.status === "ok"
                  ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                <span className="w-32 shrink-0 text-muted-foreground">{quando(l.created_at)}</span>
                <span className="w-40 shrink-0 font-medium">{l.sync_type}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {l.http_status ? `HTTP ${l.http_status} ` : ""}{l.error_message ?? ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
