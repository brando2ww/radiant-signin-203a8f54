import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, Edit, Trash2, Store, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { UnifiedCustomer } from "@/hooks/use-pdv-customers";
import { CustomerCashbackBadge } from "@/components/pdv/CustomerCashbackBadge";
import { whatsappCustomerUrl, brazilDate } from "@/lib/customer-consumption";
import { formatBRL } from "@/lib/format";

interface CustomerCardProps {
  customer: UnifiedCustomer;
  onEdit: (customer: UnifiedCustomer) => void;
  onDelete: (id: string) => void;
}

export function CustomerCard({ customer, onEdit, onDelete }: CustomerCardProps) {
  const navigate = useNavigate();
  const whatsapp = whatsappCustomerUrl(customer.phone);
  const nextExpiry = customer.cashback_balance > 0 ? customer.cashback_credits.find((credit) => credit.restante > 0 && credit.vence_em >= brazilDate())?.vence_em : null;

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/pdv/clientes/${customer.id}?source=${customer.source}`)}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{customer.name}</h3>
            <div className="flex gap-1 flex-wrap">
              {customer.channels.map((channel) => <Badge key={channel} variant="secondary" className="gap-1 text-xs">
                {channel === "pdv" ? <Store className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                {channel === "pdv" ? "Salão" : "Delivery"}
              </Badge>)}
            </div>
          </div>
          {customer.source === "pdv" && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onEdit(customer); }}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(customer.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <CustomerCashbackBadge balance={customer.cashback_balance} />
        {nextExpiry && <p className="text-xs text-muted-foreground">Próximo vencimento: {nextExpiry.split("-").reverse().join("/")}</p>}

        <div className="space-y-1.5 text-sm text-muted-foreground">
          {customer.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              {whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="underline underline-offset-2 hover:text-primary" aria-label={`Abrir WhatsApp de ${customer.name}`}>{customer.phone}</a> : <span>{customer.phone}</span>}
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{customer.email}</span>
            </div>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground pt-2 border-t">
          {customer.channels.includes("pdv") && <div className="flex justify-between gap-2"><span>Salão · {customer.salon_visits} consumo(s)</span><strong className="text-foreground">{formatBRL(customer.salon_spent)}</strong></div>}
          {customer.channels.includes("delivery") && <div className="flex justify-between gap-2"><span>Delivery · {customer.delivery_visits} pedido(s)</span><strong className="text-foreground">{formatBRL(customer.delivery_spent)}</strong></div>}
          {customer.last_visit && <p>Último consumo: {brazilDate(customer.last_visit).split("-").reverse().join("/")}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
