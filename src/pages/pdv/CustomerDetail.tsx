import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Phone, Mail, FileText, Calendar, Store, Truck, Package, Clock } from "lucide-react";
import { usePDVCustomers, useUpdateCustomer } from "@/hooks/use-pdv-customers";
import { CustomerDialog, type CustomerFormData } from "@/components/pdv/CustomerDialog";
import { CustomerCashbackBadge } from "@/components/pdv/CustomerCashbackBadge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { brazilDate, whatsappCustomerUrl } from "@/lib/customer-consumption";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";

const statusLabels: Record<string, string> = {
  fechada: "Paga",
  fechado: "Pago",
  completed: "Concluído",
  open: "Aberto",
  preparing: "Preparando",
  ready: "Pronto",
  delivered: "Entregue",
  closed: "Fechado",
  cancelled: "Cancelado",
  pending: "Pendente",
  confirmed: "Confirmado",
  out_for_delivery: "Em entrega",
};

const statusColors: Record<string, string> = {
  closed: "bg-muted text-muted-foreground",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-destructive/10 text-destructive",
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  preparing: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  out_for_delivery: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, isLoading, customersError, consumptionError, cashbackError, refetchCustomers, refetchCashback } = usePDVCustomers();
  const updateCustomer = useUpdateCustomer();
  const [editOpen, setEditOpen] = useState(false);
  const [historyChannel, setHistoryChannel] = useState("all");

  const customer = customers.find((c) => c.id === id);

  if (isLoading) return <p className="p-6">Carregando cliente e histórico…</p>;

  if (!customer) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/pdv/clientes")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <p className="text-muted-foreground">{customersError ? "Não foi possível carregar o cliente." : "Cliente não encontrado."}</p>
        {customersError && <Button onClick={() => refetchCustomers()}>Tentar novamente</Button>}
      </div>
    );
  }

  const source = customer.source;
  const handleEditSubmit = (data: CustomerFormData) => {
    updateCustomer.mutate(
      { id: customer.id, updates: { name: data.name, phone: data.phone || null, cpf: data.cpf || null, email: data.email || null, birth_date: data.birth_date || null, notes: data.notes || null } },
      { onSuccess: () => setEditOpen(false) }
    );
  };

  const whatsapp = whatsappCustomerUrl(customer.phone);
  const orders = customer.consumptions.filter((row) => historyChannel === "all" || row.canal === historyChannel).map((row) => ({
    id: row.referencia, source: row.canal, order_number: row.numero, total: row.valor, created_at: row.data_consumo, status: row.status,
  }));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/pdv/clientes")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
            <div className="flex gap-1 mt-1">{customer.channels.map((channel) => <Badge key={channel} variant="secondary" className="gap-1">
              {channel === "pdv" ? <Store className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
              {channel === "pdv" ? "Salão" : "Delivery"}
            </Badge>)}</div>
          </div>
        </div>
        {source === "pdv" && (
          <Button onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4 mr-2" /> Editar
          </Button>
        )}
      </div>

      <CustomerCashbackBadge balance={customer.cashback_balance} />
      {(consumptionError || cashbackError) && <Alert variant="destructive"><AlertDescription>
        Histórico ou saldo indisponível. <Button variant="outline" size="sm" onClick={() => { refetchCustomers(); refetchCashback(); }}>Tentar novamente</Button>
      </AlertDescription></Alert>}

      {/* Info + Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {customer.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                {whatsapp ? <a className="underline underline-offset-2 hover:text-primary" href={whatsapp} target="_blank" rel="noopener noreferrer">{customer.phone} · WhatsApp</a> : <span>{customer.phone}</span>}
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span>{customer.email}</span>
              </div>
            )}
            {customer.cpf && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4 shrink-0" />
                <span>CPF: {customer.cpf}</span>
              </div>
            )}
            {customer.birth_date && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>Nasc: {format(new Date(customer.birth_date), "dd/MM/yyyy")}</span>
              </div>
            )}
            {customer.notes && (
              <div className="pt-2 border-t text-muted-foreground">
                <p className="text-xs font-medium text-foreground mb-1">Observações</p>
                <p>{customer.notes}</p>
              </div>
            )}
            {!customer.phone && !customer.email && !customer.cpf && !customer.birth_date && (
              <p className="text-muted-foreground italic">Nenhum dado adicional cadastrado.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Consumo no salão</span><strong>{formatBRL(customer.salon_spent)} · {customer.salon_visits} consumo(s)</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Consumo no delivery</span><strong>{formatBRL(customer.delivery_spent)} · {customer.delivery_visits} pedido(s)</strong></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total gasto</span>
              <span className="font-semibold text-foreground">
                {customer.total_spent.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Visitas</span>
              <span className="font-semibold text-foreground">{customer.visit_count}</span>
            </div>
            {customer.last_visit && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Última visita</span>
                <span className="font-semibold text-foreground">
                  {format(new Date(customer.last_visit), "dd/MM/yyyy")}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente desde</span>
              <span className="font-semibold text-foreground">
                {format(new Date(customer.created_at), "MMM/yyyy", { locale: ptBR })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pedidos registrados</span>
              <span className="font-semibold text-foreground">{customer.consumptions.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Histórico de Pedidos
          </CardTitle>
          <Select value={historyChannel} onValueChange={setHistoryChannel}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Canal de consumo" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os consumos</SelectItem><SelectItem value="pdv">Salão</SelectItem><SelectItem value="delivery">Delivery</SelectItem></SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              Nenhum pedido registrado para este cliente.
            </p>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const OrderIcon = order.source === "pdv" ? Package : Truck;
                return (
                  <div
                    key={`${order.source}-${order.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="shrink-0">
                      <OrderIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground">
                          {order.source === "pdv" ? "Comanda" : "Pedido"} #{order.order_number}
                        </span>
                        <Badge variant="outline" className={`text-xs ${statusColors[order.status] || ""}`}>
                          {statusLabels[order.status] || order.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.created_at
                          ? format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : "—"}
                        {" · "}
                        {order.source === "pdv" ? "Salão" : "Delivery"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground shrink-0">
                      {order.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Créditos de cashback do salão</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {customer.cashback_credits.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum crédito emitido. O cashback é gerado após pagar uma comanda com o programa ativo.</p> :
            customer.cashback_credits.map((credit) => (
              <div key={credit.id} className="flex flex-wrap justify-between gap-2 border rounded-lg p-3 text-sm">
                <div><strong>{formatBRL(credit.valor)}</strong><p className="text-muted-foreground">Emitido em {brazilDate(credit.criado_em).split("-").reverse().join("/")}</p></div>
                <div>Vencimento: {credit.vence_em.split("-").reverse().join("/")}<p className="text-muted-foreground">{credit.restante <= 0 ? "Utilizado" : credit.vence_em < brazilDate() ? `Vencido · ${formatBRL(credit.restante)}` : `Restante: ${formatBRL(credit.restante)}`}</p></div>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {source === "pdv" && (
        <CustomerDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          customer={customer}
          onSubmit={handleEditSubmit}
          isSubmitting={updateCustomer.isPending}
        />
      )}
    </div>
  );
}
