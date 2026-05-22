import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeliveryCoupon } from "@/hooks/use-delivery-coupons";
import { CouponRow } from "./CouponRow";

interface Props {
  coupons: DeliveryCoupon[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onToggleActive: (c: DeliveryCoupon) => void;
  onEdit: (c: DeliveryCoupon) => void;
  onCopyCode: (code: string) => void;
  onCopyLink: (code: string) => void;
  onShareQR: (c: DeliveryCoupon) => void;
  onDelete: (c: DeliveryCoupon) => void;
  onOpenAnalytics: (c: DeliveryCoupon) => void;
}

export function CouponsTable({
  coupons,
  expandedId,
  onToggleExpand,
  onToggleActive,
  onEdit,
  onCopyCode,
  onCopyLink,
  onShareQR,
  onDelete,
  onOpenAnalytics,
}: Props) {
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Desconto</TableHead>
            <TableHead>Pedido mínimo</TableHead>
            <TableHead>Uso</TableHead>
            <TableHead>Validade</TableHead>
            <TableHead>Ativo</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coupons.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                Nenhum cupom corresponde aos filtros.
              </TableCell>
            </TableRow>
          )}
          {coupons.map((c) => (
            <CouponRow
              key={c.id}
              coupon={c}
              expanded={expandedId === c.id}
              onToggleExpand={() => onToggleExpand(c.id)}
              onToggleActive={() => onToggleActive(c)}
              onEdit={() => onEdit(c)}
              onCopyCode={() => onCopyCode(c.code)}
              onCopyLink={() => onCopyLink(c.code)}
              onShareQR={() => onShareQR(c)}
              onDelete={() => onDelete(c)}
              onOpenAnalytics={() => onOpenAnalytics(c)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
