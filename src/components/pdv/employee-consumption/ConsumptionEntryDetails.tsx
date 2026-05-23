import { useMemo } from "react";
import { ConsumptionEntry } from "@/hooks/use-employee-consumption";
import { usePDVUsers } from "@/hooks/use-pdv-users";
import { formatBRL } from "@/lib/format";

interface Props {
  entry: ConsumptionEntry;
}

export function ConsumptionEntryDetails({ entry }: Props) {
  const { users } = usePDVUsers();

  const operatorName = useMemo(() => {
    if (!entry.operator_id) return "—";
    const u = users.find((x: any) => x.user_id === entry.operator_id);
    return u?.display_name || u?.email || "—";
  }, [users, entry.operator_id]);

  const items = Array.isArray(entry.items) ? entry.items : [];
  const subtotal = Number(entry.subtotal || 0) || items.reduce(
    (s, i: any) => s + Number(i.unit_price || 0) * Number(i.quantity || 0),
    0,
  );
  const discount = Number(entry.discount || 0);

  return (
    <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-3 text-sm">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Itens</p>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem itens registrados.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((it: any, idx: number) => {
              const qty = Number(it.quantity || 0);
              const unit = Number(it.unit_price || 0);
              return (
                <li key={idx} className="flex justify-between gap-2">
                  <span className="truncate">
                    {qty}× {it.product_name || "Produto"}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatBRL(unit)} ={" "}
                    <span className="text-foreground font-medium">
                      {formatBRL(unit * qty)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-1 border-t pt-2">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatBRL(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>
              Desconto
              {entry.coupon_code ? ` (cupom ${entry.coupon_code})` : ""}
            </span>
            <span>− {formatBRL(discount)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatBRL(entry.total)}</span>
        </div>
        {Number(entry.paid_amount || 0) > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Pago</span>
            <span>{formatBRL(entry.paid_amount)}</span>
          </div>
        )}
      </div>

      <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
        <div className="flex justify-between gap-2">
          <span>Lançado por</span>
          <span className="text-foreground">{operatorName}</span>
        </div>
        {entry.coupon_code && !discount && (
          <div className="flex justify-between gap-2">
            <span>Cupom</span>
            <span className="text-foreground">{entry.coupon_code}</span>
          </div>
        )}
        {entry.discount_reason && (
          <div>
            <span className="block">Motivo do desconto</span>
            <span className="text-foreground">{entry.discount_reason}</span>
          </div>
        )}
        {entry.notes && (
          <div>
            <span className="block">Observação</span>
            <span className="text-foreground whitespace-pre-wrap">{entry.notes}</span>
          </div>
        )}
        {entry.over_limit_justification && (
          <div>
            <span className="block">Justificativa de limite</span>
            <span className="text-foreground whitespace-pre-wrap">
              {entry.over_limit_justification}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
