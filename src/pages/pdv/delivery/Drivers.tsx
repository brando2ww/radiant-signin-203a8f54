import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bike, Car, Footprints, MoreVertical, Plus, Phone } from "lucide-react";
import {
  type DeliveryDriver,
  type DriverStatus,
  type VehicleType,
  initialsFromName,
  useDeliveryDrivers,
} from "@/hooks/use-delivery-drivers";
import { DriverFormSheet } from "@/components/delivery/DriverFormSheet";

const VEHICLE_ICON: Record<VehicleType, typeof Bike> = {
  moto: Bike,
  bicicleta: Bike,
  carro: Car,
  a_pe: Footprints,
};

const VEHICLE_LABEL: Record<VehicleType, string> = {
  moto: "Moto",
  bicicleta: "Bicicleta",
  carro: "Carro",
  a_pe: "A pé",
};

const STATUS_LABEL: Record<DriverStatus, string> = {
  disponivel: "Disponível",
  em_entrega: "Em entrega",
  inativo: "Inativo",
};

const STATUS_VARIANT: Record<DriverStatus, "default" | "secondary" | "outline"> = {
  disponivel: "default",
  em_entrega: "secondary",
  inativo: "outline",
};

type FilterKey = "todos" | DriverStatus;

export default function DeliveryDrivers() {
  const { drivers, isLoading, remove } = useDeliveryDrivers();
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [editingDriver, setEditingDriver] = useState<DeliveryDriver | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "todos") return drivers;
    return drivers.filter((d) => d.status === filter);
  }, [drivers, filter]);

  const openNew = () => {
    setEditingDriver(null);
    setSheetOpen(true);
  };
  const openEdit = (d: DeliveryDriver) => {
    setEditingDriver(d);
    setSheetOpen(true);
  };

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-4 min-h-[calc(100vh-3.5rem)]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Entregadores</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre seus entregadores para atribuir pedidos no caixa.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Entregador
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)} className="mb-4">
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="disponivel">Disponíveis</TabsTrigger>
          <TabsTrigger value="em_entrega">Em entrega</TabsTrigger>
          <TabsTrigger value="inativo">Inativos</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum entregador {filter === "todos" ? "cadastrado" : "neste filtro"}.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((d) => {
            const VIcon = VEHICLE_ICON[d.vehicle_type];
            return (
              <Card key={d.id} className="cursor-pointer hover:bg-muted/40 transition" onClick={() => openEdit(d)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                      {d.avatar_url && <AvatarImage src={d.avatar_url} alt={d.name} />}
                      <AvatarFallback style={{ background: d.avatar_color || undefined }}>
                        {initialsFromName(d.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{d.name}</div>
                          {d.phone && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" /> {d.phone}
                            </div>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(d)}>Editar</DropdownMenuItem>
                            {d.is_active && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => remove(d.id)}
                              >
                                Desativar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant={STATUS_VARIANT[d.status]} className="text-[10px]">
                          {STATUS_LABEL[d.status]}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <VIcon className="h-3 w-3" />
                          {VEHICLE_LABEL[d.vehicle_type]}
                          {d.plate && ` · ${d.plate}`}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground mt-2">
                        Hoje: <span className="font-medium text-foreground">{d.deliveries_today}</span>
                        {" · "}Mês: <span className="font-medium text-foreground">{d.deliveries_month}</span>
                      </div>

                      {d.status === "em_entrega" && d.current_order_number && (
                        <div className="mt-2 text-xs">
                          <Badge variant="outline" className="text-[10px]">
                            Pedido #{d.current_order_number} — Em rota
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DriverFormSheet open={sheetOpen} onOpenChange={setSheetOpen} driver={editingDriver} />
    </div>
  );
}
