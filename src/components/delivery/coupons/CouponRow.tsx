import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Copy,
  Edit,
  Link2,
  MoreVertical,
  QrCode,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { DeliveryCoupon } from "@/hooks/use-delivery-coupons";
import { cn } from "@/lib/utils";
import { CouponUsageHistory } from "./CouponUsageHistory";

interface Props {
  coupon: DeliveryCoupon;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onCopyCode: () => void;
  onCopyLink: () => void;
  onShareQR: () => void;
  onDelete: () => void;
  onOpenAnalytics: () => void;
}

export function CouponRow({
  coupon,
  expanded,
  onToggleExpand,
  onToggleActive,
  onEdit,
  onCopyCode,
  onCopyLink,
  onShareQR,
  onDelete,
  onOpenAnalytics,
}: Props) {
  const now = new Date();
  const validUntil = new Date(coupon.valid_until);
  const isExpired = validUntil < now;
  const daysToExpire = Math.ceil(
    (validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isExpiringSoon = !isExpired && daysToExpire <= 7;

  const usagePct = Math.min(
    100,
    (coupon.usage_count / Math.max(1, coupon.usage_limit)) * 100
  );

  const validityBadge = isExpired ? (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      Vencido
    </Badge>
  ) : isExpiringSoon ? (
    <Badge variant="outline" className="border-orange-500/40 text-orange-600 dark:text-orange-400">
      Vence em {daysToExpire}d
    </Badge>
  ) : (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
      Válido
    </Badge>
  );

  const discountBadge =
    coupon.type === "percentage" ? (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border-0">
        {coupon.value}% OFF
      </Badge>
    ) : (
      <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 border-0">
        {formatBRL(coupon.value)} OFF
      </Badge>
    );

  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer hover:bg-muted/40",
          !coupon.is_active && "opacity-60"
        )}
        onClick={onToggleExpand}
      >
        <TableCell className="w-8">
          <ChevronRight
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              expanded && "rotate-90"
            )}
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold">{coupon.code}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onCopyCode();
              }}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </TableCell>
        <TableCell>{discountBadge}</TableCell>
        <TableCell className="text-sm">
          {coupon.min_order_value > 0 ? formatBRL(coupon.min_order_value) : "—"}
        </TableCell>
        <TableCell className="min-w-[160px]">
          <div className="space-y-1">
            <Progress value={usagePct} className="h-1.5" />
            <div className="text-xs text-muted-foreground">
              {coupon.usage_count}/{coupon.usage_limit} usados
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            {validityBadge}
            <span className="text-xs text-muted-foreground">
              até {format(validUntil, "dd/MM/yyyy", { locale: ptBR })}
            </span>
          </div>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Switch checked={coupon.is_active} onCheckedChange={onToggleActive} />
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="w-4 h-4 mr-2" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopyLink}>
                <Link2 className="w-4 h-4 mr-2" /> Copiar link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShareQR}>
                <QrCode className="w-4 h-4 mr-2" /> Ver QR Code
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="w-4 h-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="p-0">
            <CouponUsageHistory code={coupon.code} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
