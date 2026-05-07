import { useEffect, useRef, useState } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bike, Car, Footprints, Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  type DeliveryDriver,
  type DriverInput,
  type VehicleType,
  useDeliveryDrivers,
  colorForName,
  initialsFromName,
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
  { value: "bicicleta", label: "Bicicleta", Icon: Bike },
  { value: "carro", label: "Carro", Icon: Car },
  { value: "a_pe", label: "A pé", Icon: Footprints },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driver: DeliveryDriver | null;
}

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskPlate(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function DriverFormSheet({ open, onOpenChange, driver }: Props) {
  const { create, update, isMutating } = useDeliveryDrivers();
  const [deferOpen, setDeferOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      setAvatarUrl(driver.avatar_url);
    } else {
      form.reset({
        name: "",
        phone: "",
        vehicle_type: "moto",
        plate: "",
        notes: "",
        is_active: true,
      });
      setAvatarUrl(null);
    }
  }, [driver, open]);

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Não autenticado");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("delivery-drivers")
        .upload(path, file, { upsert: false, cacheControl: "3600" });
      if (error) throw error;
      const { data } = supabase.storage.from("delivery-drivers").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch (e: any) {
      toast.error("Erro no upload: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    const payload: DriverInput = {
      name: values.name.trim(),
      phone: values.phone?.trim() || null,
      vehicle_type: values.vehicle_type,
      plate: values.plate?.trim() || null,
      notes: values.notes?.trim() || null,
      is_active: values.is_active,
      avatar_url: avatarUrl,
      avatar_color: driver?.avatar_color || colorForName(values.name.trim()),
    };
    if (driver) {
      await update({
        id: driver.id,
        patch: {
          ...payload,
          status: values.is_active
            ? driver.status === "em_entrega"
              ? "em_entrega"
              : "disponivel"
            : "inativo",
        },
      });
    } else {
      await create(payload);
    }
    onOpenChange(false);
  };

  const vehicle = form.watch("vehicle_type");
  const nameValue = form.watch("name");

  return (
    <Sheet open={deferOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>{driver ? "Editar entregador" : "Novo entregador"}</SheetTitle>
          <SheetDescription>
            Cadastro de entregadores para atribuição em pedidos de delivery.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Foto */}
            <div className="flex flex-col items-center gap-3 pb-2">
              <Avatar className="h-24 w-24">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={nameValue} />}
                <AvatarFallback
                  className="text-2xl font-semibold"
                  style={{
                    background: driver?.avatar_color || colorForName(nameValue || "?"),
                    color: "#fff",
                  }}
                >
                  {initialsFromName(nameValue || "?")}
                </AvatarFallback>
              </Avatar>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Enviando…" : avatarUrl ? "Trocar foto" : "Carregar foto"}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setAvatarUrl(null)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo *</Label>
              <Input id="name" {...form.register("name")} maxLength={100} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={form.watch("phone") || ""}
                onChange={(e) => form.setValue("phone", maskPhone(e.target.value))}
                placeholder="(11) 91234-5678"
                inputMode="tel"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de veículo</Label>
              <div className="grid grid-cols-4 gap-2">
                {VEHICLES.map(({ value, label, Icon }) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => form.setValue("vehicle_type", value)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border h-20 text-xs transition ${
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
              <Input
                id="plate"
                value={form.watch("plate") || ""}
                onChange={(e) => form.setValue("plate", maskPlate(e.target.value))}
                maxLength={7}
                placeholder="ABC1D23"
                className="font-mono uppercase"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="is_active" className="cursor-pointer">Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Inativos não aparecem para atribuição de pedidos.
                </p>
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
          </div>

          <div className="border-t bg-background px-6 py-3 flex gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isMutating || uploading}>
              {driver ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
