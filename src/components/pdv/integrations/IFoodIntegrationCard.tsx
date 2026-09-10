import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import {
  useIFoodIntegration, useIFoodTenants, type IFoodAvailableMerchant,
} from "@/hooks/use-ifood-integration";
import { useSuperAdmin } from "@/hooks/use-super-admin";
import { useProductionCenters } from "@/hooks/use-production-centers";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { IFoodCatalogCodes } from "@/components/pdv/integrations/IFoodCatalogCodes";
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

  const { isSuperAdmin } = useSuperAdmin();
  const { centers } = useProductionCenters();
  const tenantsQuery = useIFoodTenants(isSuperAdmin);

  const [candidatas, setCandidatas] = useState<IFoodAvailableMerchant[] | null>(null);
  /** Dono escolhido para cada loja candidata, antes de vincular. */
  const [donoPorLoja, setDonoPorLoja] = useState<Record<string, string>>({});
  /** Vinculação manual: loja que não aparece na busca (autorizou só pedidos). */
  const [manual, setManual] = useState({ id: "", nome: "", dono: "" });

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

          {/* A ressalva do módulo 'Loja' fica aqui, discreta e permanente. Em
              toast ela era lida como erro: mensagem comprida logo depois de um
              clique em "Testar conexão" parece defeito, mesmo em verde. */}
          {testConnection.data?.limitado && (
            <p className="text-xs text-muted-foreground">
              Esta loja liberou no iFood só os módulos de pedido. O Velara recebe e
              responde pedidos normalmente, mas não consegue ler daqui se a loja está
              aberta ou fechada. Para ter essa leitura, o dono da loja autoriza o
              módulo <strong>Loja</strong> no portal do iFood.
            </p>
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

            {/* Vincular loja é operação de implantação: o polling é global e a
                lista traz lojas de TODOS os clientes. Quem não é da equipe nem
                vê o botão — antes via, clicava e recebia um 403 seco. */}
            {!isSuperAdmin ? (
              <p className="text-sm text-muted-foreground">
                A vinculação da loja é feita pela equipe Velara. Autorize a Velara no
                Portal do Parceiro do iFood e avise o suporte: a loja aparece aqui
                assim que for vinculada.
              </p>
            ) : (
              <>
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
                    Nenhuma loja nova disponível. Se a loja não aparece, ela ainda não
                    autorizou a Velara no Portal do Parceiro — ou o aplicativo em uso
                    não é o de produção.
                  </p>
                )}

                {/* Vinculação por ID. A loja escolhe quais módulos autoriza;
                    quem libera só 'order' e 'events' — o bastante para receber
                    pedido — não aparece em GET /merchants, porque listar loja é
                    o módulo 'merchant'. Sem este caminho, essas lojas ficariam
                    impossíveis de conectar. */}
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    A loja não apareceu na busca? Vincular pelo ID
                  </summary>
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Copie o ID no Portal do Desenvolvedor do iFood, em Permissões. É
                      normal a loja não aparecer na busca quando ela autorizou apenas os
                      módulos de pedido · isso não impede receber pedidos.
                    </p>
                    <Input
                      placeholder="ID da loja no iFood (UUID)"
                      value={manual.id}
                      onChange={(e) => setManual((m) => ({ ...m, id: e.target.value.trim() }))}
                      className="font-mono text-xs"
                    />
                    <Input
                      placeholder="Nome da loja (como aparece no iFood)"
                      value={manual.nome}
                      onChange={(e) => setManual((m) => ({ ...m, nome: e.target.value }))}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={manual.dono}
                        onValueChange={(v) => setManual((m) => ({ ...m, dono: v }))}
                      >
                        <SelectTrigger className="h-9 w-full sm:w-72">
                          <SelectValue placeholder="Escolha o restaurante que recebe os pedidos" />
                        </SelectTrigger>
                        <SelectContent>
                          {(tenantsQuery.data?.tenants ?? []).map((t) => (
                            <SelectItem key={t.userId} value={t.userId}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={
                          linkMerchant.isPending || !manual.id || !manual.nome || !manual.dono
                        }
                        onClick={() =>
                          linkMerchant.mutate(
                            { merchantId: manual.id, targetUserId: manual.dono, name: manual.nome },
                            { onSuccess: () => setManual({ id: "", nome: "", dono: "" }) },
                          )
                        }
                      >
                        Vincular pelo ID
                      </Button>
                    </div>
                  </div>
                </details>

                {candidatas?.filter((c) => !c.linked).map((c) => (
                  <div key={c.id} className="space-y-2 rounded-md border border-dashed p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{c.name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{c.id}</p>
                    </div>
                    {/* O nome que vem do iFood é a razão social; adivinhar o dono
                        pelo nome erraria, e errar aqui entrega o pedido de um
                        restaurante na conta de outro. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={donoPorLoja[c.id] ?? ""}
                        onValueChange={(v) => setDonoPorLoja((m) => ({ ...m, [c.id]: v }))}
                      >
                        <SelectTrigger className="h-9 w-full sm:w-72">
                          <SelectValue placeholder="Escolha o restaurante que recebe os pedidos" />
                        </SelectTrigger>
                        <SelectContent>
                          {(tenantsQuery.data?.tenants ?? []).map((t) => (
                            <SelectItem key={t.userId} value={t.userId}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() =>
                          linkMerchant.mutate({ merchantId: c.id, targetUserId: donoPorLoja[c.id] })
                        }
                        disabled={linkMerchant.isPending || !donoPorLoja[c.id]}
                      >
                        Vincular
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}
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

            {/* Onde imprime o que não tem praça definida.
                O item só encontra sua praça sozinho quando o produto do iFood
                está ligado ao produto daqui. Enquanto os códigos do cardápio não
                estiverem colados no iFood, a maioria chega sem vínculo — e sem
                este padrão o pedido não imprime em lugar nenhum, que foi o que
                aconteceu com os 5 primeiros pedidos do Kōten Garibaldi. */}
            <div className="space-y-1.5">
              <Label htmlFor="ifood-centro" className="text-sm">Impressora padrão dos pedidos</Label>
              <p className="text-xs text-muted-foreground">
                Usada quando o item não tem praça própria. Item com produto vinculado
                continua indo para a praça dele.
              </p>
              <Select
                value={settings?.ifood_default_production_center_id ?? "nenhum"}
                onValueChange={(v) =>
                  updateSettings.mutate({
                    ifood_default_production_center_id: v === "nenhum" ? null : v,
                  } as any)
                }
              >
                <SelectTrigger id="ifood-centro" className="h-9">
                  <SelectValue placeholder="Escolha o centro de produção" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhuma (não imprime sem praça)</SelectItem>
                  {(centers ?? [])
                    .filter((c: any) => c.is_active && c.printer_ip)
                    .map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.printer_ip}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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

      {/* Códigos do cardápio: o que o lojista precisa digitar no iFood para o
          pedido casar com o produto certo aqui dentro. */}
      <IFoodCatalogCodes />

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
