import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Bike, Car, Footprints, Bike as BikeIcon } from "lucide-react";
import {
  type DeliveryDriver,
  type DriverInput,
  type VehicleType,
  useDeliveryDrivers,
  colorForName,
} from "@/hooks/use-delivery-drivers";

const schema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(100),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  vehicle_type: z.enum(["moto", "bicicleta", "carro", "a_pe"]),
  plate: z.string().trim().max(10).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const VEHICLES: Array<{ value: VehicleType; label: string; Icon: typeof Bike }> = [
  { value: "moto", label: "Moto", Icon: Bike },
  { value: "bicicleta", label: "Bicicleta", Icon: BikeIcon },
  { value: "carro", label: "Carro", Icon: Car },
  { value: "a_pe", label: "A pé", Icon: Footprints },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driver: DeliveryDriver | null;
}

export function DriverFormSheet({ open, onOpenChange, driver }: Props) {
  const { create, update, isMutating } = useDeliveryDrivers();
  const [deferOpen, setDeferOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setDeferOpen(true), 0);
      return () => clearTimeout(t);
    }
    setDeferOpen(false);
  }, [open]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      phone: "",
      vehicle_type: "moto",
      plate: "",
      notes: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (driver) {
      form.reset({
        name: driver.name,
        phone: driver.phone ?? "",
        vehicle_type: driver.vehicle_type,
        plate: driver.plate ?? "",
        notes: driver.notes ?? "",
        is_active: driver.is_active,
      });
    } else {
      form.reset({
        name: "",
        phone: "",
        vehicle_type: "moto",
        plate: "",
        notes: "",
        is_active: true,
      });
    }
  }, [driver, open]);

  const onSubmit = async (values: FormValues) => {
    const payload: DriverInput = {
      name: values.name.trim(),
      phone: values.phone?.trim() || null,
      vehicle_type: values.vehicle_type,
      plate: values.plate?.trim() || null,
      notes: values.notes?.trim() || null,
      is_active: values.is_active,
      avatar_color: driver?.avatar_color || colorForName(values.name.trim()),
    };
    if (driver) {
      await update({ id: driver.id, patch: payload });
    } else {
      await create(payload);
    }
    onOpenChange(false);
  };

  const vehicle = form.watch("vehicle_type");

  return (
    <Sheet open={deferOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{driver ? "Editar entregador" : "Novo entregador"}</SheetTitle>
          <SheetDescription>
            Cadastro de entregadores para atribuição em pedidos de delivery.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome completo *</Label>
            <Input id="name" {...form.register("name")} maxLength={100} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" {...form.register("phone")} placeholder="(11) 91234-5678" />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de veículo</Label>
            <div className="grid grid-cols-4 gap-2">
              {VEHICLES.map(({ value, label, Icon }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => form.setValue("vehicle_type", value)}
                  className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition ${
                    vehicle === value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plate">Placa (opcional)</Label>
            <Input id="plate" {...form.register("plate")} maxLength={10} placeholder="ABC1D23" />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="is_active" className="cursor-pointer">Ativo</Label>
              <p className="text-xs text-muted-foreground">Inativos não aparecem para atribuição.</p>
            </div>
            <Switch
              id="is_active"
              checked={form.watch("is_active")}
              onCheckedChange={(v) => form.setValue("is_active", v)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observação interna</Label>
            <Textarea id="notes" rows={3} {...form.register("notes")} maxLength={500} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isMutating}>
              {driver ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
