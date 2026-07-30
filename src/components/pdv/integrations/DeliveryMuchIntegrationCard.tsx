import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Store,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeliveryMuchIntegration } from "@/hooks/use-deliverymuch-integration";
import { useDeliveryMuchMapping } from "@/hooks/use-deliverymuch-mapping";
import { DeliveryMuchMappingCard } from "./DeliveryMuchMappingCard";

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function tokenHealth(expiresAt: string | null, canAutoRenew: boolean) {
  if (!expiresAt) return { tone: "muted" as const, text: "Sessão não iniciada" };

  const minutesLeft = Math.round((Date.parse(expiresAt) - Date.now()) / 60000);
  if (minutesLeft > 0) {
    return {
      tone: "ok" as const,
      text: `Sessão válida por mais ${minutesLeft} min${canAutoRenew ? " · renova sozinha" : ""}`,
    };
  }
  return canAutoRenew
    ? { tone: "ok" as const, text: "Sessão expirada · será renovada no próximo uso" }
    : { tone: "warn" as const, text: "Sessão expirada · é preciso conectar de novo" };
}

function ConnectionCard() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deliveryMin, setDeliveryMin] = useState<number | "">("");
  const [pickupMin, setPickupMin] = useState<number | "">("");

  const {
    settings,
    status,
    company,
    companyError,
    log,
    isLoading,
    isConnected,
    needsCompanySelection,
    connect,
    selectCompany,
    testConnection,
    toggleOnline,
    setDeliveryTime,
    disconnect,
    updateSettings,
  } = useDeliveryMuchIntegration();

  const { productionCenters } = useDeliveryMuchMapping();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const health = tokenHealth(status?.token_expires_at ?? null, status?.can_auto_renew ?? false);
  const isProd = settings.deliverymuch_env === "prod";

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    connect.mutate({ username: username.trim(), password }, {
      onSuccess: () => setPassword(""),
    });
  };

  // manda só o que foi digitado · a rota aceita alterar um tempo de cada vez
  const handleSetDeliveryTime = () => {
    setDeliveryTime.mutate({
      ...(deliveryMin === "" ? {} : { delivery_min: Number(deliveryMin) }),
      ...(pickupMin === "" ? {} : { pickup_min: Number(pickupMin) }),
    }, {
      onSuccess: () => {
        setDeliveryMin("");
        setPickupMin("");
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              DeliveryMuch
              {isConnected ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="secondary">Desconectado</Badge>
              )}
              <Badge variant={isProd ? "default" : "outline"} className="font-normal">
                {isProd ? "Produção" : "Homologação"}
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Conecte a loja à plataforma DeliveryMuch para operar pelo PDV.
            </p>
          </div>
          {isConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? "Desconectando..." : "Desconectar"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Recebimento de pedidos ainda não liberado ── */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <span className="font-medium">Em implantação.</span> Conexão, controle da loja e tempos
            de entrega já funcionam. O recebimento automático de pedidos no PDV ainda está em
            desenvolvimento, então continue acompanhando os pedidos pelo aplicativo Eugênio.
          </AlertDescription>
        </Alert>

        {isConnected && companyError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              A loja está autenticada, mas a API da DeliveryMuch não está respondendo agora. As ações
              de abrir, fechar e alterar tempos vão falhar até a plataforma voltar.
            </AlertDescription>
          </Alert>
        )}

        {/* ── Não conectado: ambiente + login ── */}
        {!isConnected && (
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Ambiente</Label>
              <RadioGroup
                value={settings.deliverymuch_env}
                onValueChange={(value) =>
                  updateSettings.mutate({ deliverymuch_env: value as "dev" | "prod" })
                }
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="dev" id="dm-env-dev" />
                  <Label htmlFor="dm-env-dev" className="text-sm font-normal">
                    Homologação
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="prod" id="dm-env-prod" />
                  <Label htmlFor="dm-env-prod" className="text-sm font-normal">
                    Produção
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                As credenciais de homologação não funcionam em produção, e vice-versa.
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use o usuário e a senha da loja na DeliveryMuch, os mesmos do aplicativo Eugênio.
              </p>
              <div className="space-y-2">
                <Label htmlFor="dm-username">Usuário da loja</Label>
                <Input
                  id="dm-username"
                  autoComplete="off"
                  placeholder="usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dm-password">Senha</Label>
                <Input
                  id="dm-password"
                  type="password"
                  autoComplete="off"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  A senha é usada só para gerar a sessão e não fica guardada no sistema.
                </p>
              </div>
              <Button type="submit" className="w-full gap-2" disabled={connect.isPending}>
                {connect.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Conectando...</>
                  : <><Plug className="h-4 w-4" /> Conectar loja</>}
              </Button>
            </div>
          </form>
        )}

        {/* ── Conectado com mais de uma loja: escolher ── */}
        {needsCompanySelection && (
          <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Store className="h-4 w-4" />
              Escolha a loja deste estabelecimento
            </div>
            <p className="text-xs text-muted-foreground">
              Este login administra mais de uma unidade na DeliveryMuch. Vincule a que corresponde a
              este PDV.
            </p>
            <RadioGroup
              onValueChange={(value) => selectCompany.mutate(value)}
              className="space-y-2"
            >
              {settings.deliverymuch_companies.map((uuid) => (
                <div key={uuid} className="flex items-center gap-2">
                  <RadioGroupItem value={uuid} id={`dm-company-${uuid}`} />
                  <Label htmlFor={`dm-company-${uuid}`} className="font-mono text-xs font-normal">
                    {uuid}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}

        {/* ── Conectado: saúde da conexão ── */}
        {isConnected && (
          <>
            <div className="space-y-2 rounded-md bg-muted/50 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Usuário</span>
                <span className="font-medium">{settings.deliverymuch_username}</span>
              </div>
              {settings.deliverymuch_company_uuid && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Loja</span>
                  {company
                    ? <span className="font-medium">{company.name}</span>
                    : <span className="font-mono">{settings.deliverymuch_company_uuid}</span>}
                </div>
              )}
              {company?.address?.city && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Endereço</span>
                  <span className="text-right">
                    {[company.address.street, company.address.number, company.address.district]
                      .filter(Boolean).join(", ")}
                    {company.address.city ? ` · ${company.address.city}` : ""}
                  </span>
                </div>
              )}
              {company && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Status na plataforma</span>
                  <span className={company.is_online ? "font-medium text-emerald-600" : "font-medium text-muted-foreground"}>
                    {company.is_online ? "Online" : "Offline"}
                  </span>
                </div>
              )}
              {settings.deliverymuch_connected_at && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Conectada em</span>
                  <span>{formatDateTime(settings.deliverymuch_connected_at)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                {health.tone === "ok"
                  ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  : <Clock className="h-3.5 w-3.5 text-amber-500" />}
                <span className={health.tone === "warn" ? "text-amber-600" : "text-muted-foreground"}>
                  {health.text}
                </span>
              </div>
            </div>

            {settings.deliverymuch_last_error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {settings.deliverymuch_last_error}
                  {settings.deliverymuch_last_error_at && (
                    <span className="block text-xs opacity-80">
                      {formatDateTime(settings.deliverymuch_last_error_at)}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => toggleOnline.mutate(true)}
                disabled={toggleOnline.isPending || company?.is_online === true}
              >
                <Wifi className="h-4 w-4 text-emerald-500" />
                Abrir loja
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => toggleOnline.mutate(false)}
                disabled={toggleOnline.isPending || company?.is_online === false}
              >
                <WifiOff className="h-4 w-4 text-muted-foreground" />
                Fechar loja
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => testConnection.mutate()}
                disabled={testConnection.isPending || !settings.deliverymuch_company_uuid}
              >
                {testConnection.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
                Testar
              </Button>
            </div>

            {/* ── Operação ── */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-start justify-between gap-4 rounded-md border border-blue-500/40 bg-blue-500/5 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="dm-shadow" className="text-sm">
                    Modo observação
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ligado, a integração só acompanha os pedidos para conferência: não cria pedido
                    no PDV, não imprime e não responde nada para a plataforma. A loja segue operando
                    pelo Eugênio. Desligue só depois de comparar alguns pedidos.
                  </p>
                </div>
                <Switch
                  id="dm-shadow"
                  checked={settings.deliverymuch_shadow_mode}
                  onCheckedChange={(checked) =>
                    updateSettings.mutate({ deliverymuch_shadow_mode: checked })}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="dm-auto-accept" className="text-sm">
                    Aceitar pedidos automaticamente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Recomendado. Pedido não aceito em 15 minutos é cancelado pela plataforma e a
                    loja é colocada offline.
                  </p>
                </div>
                <Switch
                  id="dm-auto-accept"
                  checked={settings.deliverymuch_auto_accept}
                  onCheckedChange={(checked) =>
                    updateSettings.mutate({ deliverymuch_auto_accept: checked })}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="dm-require-cashier" className="text-sm">
                    Só aceitar com o caixa aberto
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Evita aceitar pedido que ninguém vai produzir. Com o caixa fechado, o pedido
                    entra mas fica esperando aceite manual.
                  </p>
                </div>
                <Switch
                  id="dm-require-cashier"
                  checked={settings.deliverymuch_require_open_cashier}
                  onCheckedChange={(checked) =>
                    updateSettings.mutate({ deliverymuch_require_open_cashier: checked })}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="dm-paused" className="text-sm">
                    Pausar recebimento
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Para de puxar pedidos sem desconectar a loja. Atenção: os pedidos continuam
                    entrando na plataforma.
                  </p>
                </div>
                <Switch
                  id="dm-paused"
                  checked={settings.deliverymuch_paused}
                  onCheckedChange={(checked) =>
                    updateSettings.mutate({ deliverymuch_paused: checked })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">Impressora padrão dos itens sem vínculo</Label>
                <Select
                  value={settings.deliverymuch_default_production_center_id ?? undefined}
                  onValueChange={(value) =>
                    updateSettings.mutate({ deliverymuch_default_production_center_id: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Escolher centro de produção" />
                  </SelectTrigger>
                  <SelectContent>
                    {productionCenters.map((center) => (
                      <SelectItem key={center.id} value={center.id}>
                        {center.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Enquanto um produto da plataforma não estiver vinculado, o item sai por aqui.
                </p>
              </div>
            </div>

            {/* ── Tempos médios na plataforma ── */}
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Tempos médios (minutos)</p>
              <p className="text-xs text-muted-foreground">
                É o tempo que o cliente vê no aplicativo. A plataforma leva alguns instantes para
                refletir a mudança.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="dm-delivery-min" className="text-xs text-muted-foreground">
                    Entrega
                  </Label>
                  <Input
                    id="dm-delivery-min"
                    type="number"
                    min={1}
                    max={180}
                    placeholder={String(company?.delivery_time ?? settings.deliverymuch_delivery_time_min)}
                    value={deliveryMin}
                    onChange={(e) => setDeliveryMin(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dm-pickup-min" className="text-xs text-muted-foreground">
                    Retirada
                  </Label>
                  <Input
                    id="dm-pickup-min"
                    type="number"
                    min={1}
                    max={180}
                    placeholder={String(company?.pickup_time ?? settings.deliverymuch_pickup_time_min)}
                    value={pickupMin}
                    onChange={(e) => setPickupMin(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-1 w-full"
                onClick={handleSetDeliveryTime}
                disabled={setDeliveryTime.isPending || (deliveryMin === "" && pickupMin === "")}
              >
                {setDeliveryTime.isPending ? "Salvando..." : "Atualizar tempos"}
              </Button>
            </div>

            {/* ── Histórico ── */}
            {log.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Últimos eventos</p>
                <div className="space-y-1">
                  {log.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 text-xs">
                      {entry.status === "ok"
                        ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                        : <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />}
                      <span className="font-mono text-muted-foreground">{entry.action}</span>
                      <span className="flex-1 text-muted-foreground">
                        {entry.message ?? (entry.http_status ? `HTTP ${entry.http_status}` : "")}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A tela da integração é a conexão mais os vínculos. O de-para só aparece
 * depois de conectar, porque antes disso não há nada para vincular.
 */
export function DeliveryMuchIntegrationCard() {
  const { isConnected } = useDeliveryMuchIntegration();

  return (
    <div className="space-y-4">
      <ConnectionCard />
      {isConnected && <DeliveryMuchMappingCard />}
    </div>
  );
}
