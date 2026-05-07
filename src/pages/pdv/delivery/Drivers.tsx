import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  Bike,
  Car,
  Footprints,
  Pencil,
  Plus,
  Search,
  Trash2,
  MessageCircle,
} from "lucide-react";
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

const STATUS_BADGE_CLASS: Record<DriverStatus, string> = {
  disponivel: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent hover:bg-green-500/20",
  em_entrega: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-transparent hover:bg-yellow-500/20",
  inativo: "bg-muted text-muted-foreground border-transparent hover:bg-muted",
};

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/55${digits}`;
}

export default function DeliveryDrivers() {
  const { drivers, isLoading, update, remove } = useDeliveryDrivers();
  const [query, setQuery] = useState("");
  const [editingDriver, setEditingDriver] = useState<DeliveryDriver | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DeliveryDriver | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => d.name.toLowerCase().includes(q));
  }, [drivers, query]);

  const openNew = () => {
    setEditingDriver(null);
    setSheetOpen(true);
  };
  const openEdit = (d: DeliveryDriver) => {
    setEditingDriver(d);
    setSheetOpen(true);
  };

  const toggleActive = (d: DeliveryDriver, next: boolean) => {
    update({
      id: d.id,
      patch: {
        is_active: next,
        status: next
          ? d.status === "em_entrega"
            ? "em_entrega"
            : "disponivel"
          : "inativo",
      },
    });
  };

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 min-h-[calc(100vh-3.5rem)]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Entregadores</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie sua equipe de entrega
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Entregador
        </Button>
      </div>

      {drivers.length > 0 && (
        <div className="relative max-w-sm mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : drivers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bike className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Nenhum entregador cadastrado ainda</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Cadastre seus entregadores para atribuir pedidos no caixa.
            </p>
            <Button onClick={openNew} className="gap-2 mt-5">
              <Plus className="h-4 w-4" /> Cadastrar primeiro entregador
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum entregador encontrado para "{query}".
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => {
            const VIcon = VEHICLE_ICON[d.vehicle_type];
            const dim = !d.is_active;
            return (
              <Card
                key={d.id}
                className={`flex flex-col h-full transition ${dim ? "opacity-60" : ""}`}
              >
                <CardContent className="p-5 flex flex-col h-full">
                  {/* Top: avatar + info + status */}
                  <div className="flex items-start gap-3">
                    <Avatar className="h-14 w-14">
                      {d.avatar_url && <AvatarImage src={d.avatar_url} alt={d.name} />}
                      <AvatarFallback
                        className="text-base font-semibold"
                        style={{ background: d.avatar_color || undefined, color: "#fff" }}
                      >
                        {initialsFromName(d.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold truncate text-base">{d.name}</h3>
                        <Badge className={`${STATUS_BADGE_CLASS[d.status]} text-[10px] shrink-0`}>
                          {STATUS_LABEL[d.status]}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <VIcon className="h-3.5 w-3.5" />
                          {VEHICLE_LABEL[d.vehicle_type]}
                        </span>
                        {d.plate && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {d.plate}
                          </Badge>
                        )}
                      </div>

                      {d.phone && (
                        <a
                          href={whatsappLink(d.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {d.phone}
                        </a>
                      )}

                      {d.status === "em_entrega" && d.current_order_number && (
                        <div className="mt-2">
                          <Badge variant="outline" className="text-[10px]">
                            Pedido #{d.current_order_number} — Em rota
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-4 border-t mt-4 flex items-end justify-between gap-2">
                    <div className="flex gap-5">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Hoje</div>
                        <div className="text-xl font-semibold leading-none">{d.deliveries_today}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mês</div>
                        <div className="text-sm font-medium text-muted-foreground leading-none mt-1">
                          {d.deliveries_month}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={d.is_active}
                        onCheckedChange={(v) => toggleActive(d, v)}
                        aria-label="Ativo"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(d)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(d)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DriverFormSheet open={sheetOpen} onOpenChange={setSheetOpen} driver={editingDriver} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar entregador?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} deixará de aparecer para atribuição de pedidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) remove(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
