import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChefHat,
  Bike,
  ClipboardList,
  PackageCheck,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { OrderTrackingView } from "./checkout/OrderTrackingView";
import { useActiveOrder } from "@/hooks/use-active-order";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
}

const STATUS_META: Record<
  string,
  { label: string; Icon: typeof Clock; pulse?: boolean }
> = {
  pending: { label: "Pedido recebido", Icon: ClipboardList, pulse: true },
  confirmed: { label: "Confirmado", Icon: CheckCircle2 },
  preparing: { label: "Em preparo", Icon: ChefHat, pulse: true },
  ready: { label: "Pronto", Icon: PackageCheck },
  delivering: { label: "Saiu para entrega", Icon: Bike, pulse: true },
  completed: { label: "Entregue", Icon: CheckCircle2 },
  cancelled: { label: "Cancelado", Icon: XCircle },
};

export const ActiveOrderChip = ({ userId }: Props) => {
  const { orderId, order, clear } = useActiveOrder(userId);
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Fecha automaticamente o sheet quando o pedido é finalizado e limpo
  useEffect(() => {
    if (!orderId) setOpen(false);
  }, [orderId]);

  if (!orderId || !order) return null;

  const meta = STATUS_META[order.status] ?? STATUS_META.pending;
  const Icon = meta.Icon;
  const isCancelled = order.status === "cancelled";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-24 right-4 z-40 flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-full shadow-lg",
          "bg-card border border-border hover:bg-muted transition-colors",
          "max-w-[calc(100vw-2rem)]",
        )}
        aria-label="Acompanhar pedido em andamento"
      >
        <span
          className={cn(
            "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
            isCancelled ? "bg-destructive/15" : "bg-primary/15",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              isCancelled ? "text-destructive" : "text-primary",
              meta.pulse ? "animate-pulse" : "",
            )}
          />
        </span>
        <span className="flex flex-col items-start min-w-0 text-left">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground leading-none">
            Pedido #{order.order_number}
          </span>
          <span className="text-sm font-medium leading-tight truncate">
            {meta.label}
          </span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-[92vh] sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:mx-auto rounded-t-2xl p-0 flex flex-col"
        >
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className="h-1 w-12 rounded-full bg-muted" />
          </div>
          <SheetHeader className="px-5 pb-3 shrink-0 text-left flex-row items-center justify-between gap-2">
            <SheetTitle>Acompanhar pedido</SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmClear(true)}
            >
              Parar de acompanhar
            </Button>
          </SheetHeader>
          <div className="flex-1 overflow-hidden px-4 pb-4">
            <OrderTrackingView orderId={orderId} onClose={() => setOpen(false)} userId={userId} />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parar de acompanhar este pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido continuará normalmente no restaurante. Você só não verá mais o status aqui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clear();
                setOpen(false);
              }}
            >
              Parar de acompanhar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
