import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bike, UserPlus } from "lucide-react";
import { useDeliveryDrivers, useAssignDriver, initialsFromName } from "@/hooks/use-delivery-drivers";
import { Link } from "react-router-dom";

interface Props {
  orderId: string;
  trigger?: React.ReactNode;
}

export const AssignDriverPopover = ({ orderId, trigger }: Props) => {
  const [open, setOpen] = useState(false);
  const { drivers } = useDeliveryDrivers();
  const { assignDriver, isAssigning } = useAssignDriver();

  const available = drivers.filter((d) => d.is_active && d.status !== "inativo");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger ?? (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
            <UserPlus className="h-3 w-3" /> Atribuir entregador
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        {drivers.length === 0 ? (
          <div className="text-center py-3 space-y-2">
            <p className="text-xs text-muted-foreground">Nenhum entregador cadastrado</p>
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link to="/pdv/delivery/entregadores">Cadastrar entregador</Link>
            </Button>
          </div>
        ) : available.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Todos os entregadores estão inativos
          </p>
        ) : (
          <div className="space-y-1 max-h-60 overflow-auto">
            {available.map((d) => (
              <button
                key={d.id}
                disabled={isAssigning}
                onClick={async () => {
                  await assignDriver({ orderId, driverId: d.id });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted text-left"
              >
                <Avatar className="h-7 w-7">
                  {d.avatar_url && <AvatarImage src={d.avatar_url} />}
                  <AvatarFallback className="text-xs">{initialsFromName(d.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Bike className="h-3 w-3" /> {d.vehicle_type}
                  </p>
                </div>
                {d.status === "em_entrega" && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                    {(d as any).active_orders ?? 1} em rota
                  </Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
