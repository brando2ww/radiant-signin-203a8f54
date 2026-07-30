import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Download, Info, Link2, Loader2, Sparkles } from "lucide-react";
import {
  PAYMENT_METHOD_OPTIONS,
  suggestProduct,
  useDeliveryMuchMapping,
} from "@/hooks/use-deliverymuch-mapping";

const UNLINKED = "__none__";

export function DeliveryMuchMappingCard() {
  const {
    productMap,
    shadowOrders,
    pendingProducts,
    paymentMap,
    localProducts,
    productionCenters,
    isLoadingProducts,
    linkProduct,
    ignoreProduct,
    setPaymentMethod,
    seedPaymentMap,
  } = useDeliveryMuchMapping();

  const mapped = productMap.filter((p) => p.status === "mapped");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          Vínculos da DeliveryMuch
          {pendingProducts.length > 0 && (
            <Badge variant="destructive">{pendingProducts.length} a vincular</Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          De-para entre o que vem da plataforma e o cadastro do seu PDV.
        </p>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="produtos">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
            <TabsTrigger value="observacao">Observação</TabsTrigger>
          </TabsList>

          {/* ── Produtos ───────────────────────────────────────────────── */}
          <TabsContent value="produtos" className="space-y-4 pt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                A DeliveryMuch não disponibiliza o cardápio pela API, então os produtos aparecem
                aqui conforme os pedidos vão chegando. Um item sem vínculo nunca impede o pedido de
                entrar: ele entra com o nome da plataforma e sai na impressora padrão até você
                vincular.
              </AlertDescription>
            </Alert>

            {isLoadingProducts && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            )}

            {!isLoadingProducts && productMap.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum produto recebido ainda. Assim que o primeiro pedido chegar, os itens
                aparecem aqui para vincular.
              </p>
            )}

            {pendingProducts.map((entry) => {
              const suggestion = suggestProduct(entry.external_name, localProducts);

              return (
                <div key={entry.id} className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{entry.external_name ?? "Sem nome"}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {entry.external_product_id}
                      </p>
                    </div>
                    <Badge variant="outline" className="font-normal">
                      {entry.times_seen}x recebido
                    </Badge>
                  </div>

                  {suggestion && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full gap-2"
                      onClick={() =>
                        linkProduct.mutate({ id: entry.id, delivery_product_id: suggestion.id })}
                      disabled={linkProduct.isPending}
                    >
                      <Sparkles className="h-4 w-4" />
                      Vincular a "{suggestion.name}"
                    </Button>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Produto do PDV</Label>
                      <Select
                        onValueChange={(value) =>
                          linkProduct.mutate({
                            id: entry.id,
                            delivery_product_id: value === UNLINKED ? null : value,
                          })}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Escolher produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {localProducts.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Centro de produção</Label>
                      <Select
                        value={entry.production_center_id ?? undefined}
                        onValueChange={(value) =>
                          linkProduct.mutate({
                            id: entry.id,
                            delivery_product_id: entry.delivery_product_id,
                            production_center_id: value === UNLINKED ? null : value,
                          })}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Padrão" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNLINKED}>Usar o padrão</SelectItem>
                          {productionCenters.map((center) => (
                            <SelectItem key={center.id} value={center.id}>
                              {center.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => ignoreProduct.mutate(entry.id)}
                    disabled={ignoreProduct.isPending}
                  >
                    Ignorar este item
                  </Button>
                </div>
              );
            })}

            {mapped.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">Já vinculados ({mapped.length})</p>
                {mapped.map((entry) => {
                  const local = localProducts.find((p) => p.id === entry.delivery_product_id);
                  return (
                    <div key={entry.id} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span className="flex-1 truncate">{entry.external_name}</span>
                      <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-muted-foreground">
                        {local?.name ?? "produto removido"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Pagamentos ─────────────────────────────────────────────── */}
          <TabsContent value="pagamentos" className="space-y-4 pt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Define como cada forma de pagamento da DeliveryMuch entra no seu caixa. O que é pago
                online já entra quitado e não deve ser cobrado na entrega.
              </AlertDescription>
            </Alert>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => seedPaymentMap.mutate()}
              disabled={seedPaymentMap.isPending}
            >
              {seedPaymentMap.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</>
                : <><Download className="h-4 w-4" /> Carregar formas de pagamento da loja</>}
            </Button>

            {paymentMap.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nenhuma forma de pagamento carregada. Use o botão acima para buscar da plataforma os
                cartões que esta loja aceita.
              </p>
            )}

            {paymentMap.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.label ?? entry.external_key}</p>
                  <p className="font-mono text-xs text-muted-foreground">{entry.external_key}</p>
                </div>
                <Select
                  value={entry.payment_method}
                  onValueChange={(value) =>
                    setPaymentMethod.mutate({ id: entry.id, payment_method: value })}
                >
                  <SelectTrigger className="h-8 w-40 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </TabsContent>
          {/* ── Observação ─────────────────────────────────────────────── */}
          <TabsContent value="observacao" className="space-y-3 pt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Estes são os pedidos que a integração enxergou na plataforma enquanto o modo
                observação está ligado. Nenhum deles entrou no PDV nem foi impresso. Compare com o
                aplicativo Eugênio: se os valores, itens e formas de pagamento baterem, é seguro
                desligar o modo observação.
              </AlertDescription>
            </Alert>

            {shadowOrders.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum pedido observado ainda.
              </p>
            )}

            {shadowOrders.map((order) => (
              <div key={order.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium">
                    {order.external_code ?? "sem código"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-normal">
                      {order.preview?.order_type === "pickup" ? "Retirada" : "Entrega"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.first_seen_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{order.preview?.customer_name ?? "sem cliente"}</span>
                  <span>
                    {typeof order.preview?.total === "number"
                      ? order.preview.total.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })
                      : "sem total"}
                  </span>
                  <span>{order.preview?.payment_method ?? "sem pagamento"}</span>
                  <span>{order.external_stage}</span>
                </div>

                {order.preview?.items && order.preview.items.length > 0 && (
                  <div className="space-y-0.5 border-t pt-2">
                    {order.preview.items.map((item, index) => (
                      <p key={index} className="text-xs">
                        {item.quantity}x {item.product_name}
                        {item.options && (
                          <span className="text-muted-foreground"> · {item.options}</span>
                        )}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
