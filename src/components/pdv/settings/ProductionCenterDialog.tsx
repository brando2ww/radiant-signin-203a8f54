import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProductionCenter, useProductionCenters } from "@/hooks/use-production-centers";
import { ChefHat, Wine, Coffee, Cake, Pizza, Soup, Sandwich, IceCream, Beer, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductionCenterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  center?: ProductionCenter | null;
}

const ICON_OPTIONS = [
  { name: "ChefHat", Icon: ChefHat },
  { name: "Wine", Icon: Wine },
  { name: "Coffee", Icon: Coffee },
  { name: "Cake", Icon: Cake },
  { name: "Pizza", Icon: Pizza },
  { name: "Soup", Icon: Soup },
  { name: "Sandwich", Icon: Sandwich },
  { name: "IceCream", Icon: IceCream },
  { name: "Beer", Icon: Beer },
  { name: "Utensils", Icon: Utensils },
];

const COLOR_OPTIONS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
];

export function ProductionCenterDialog({ open, onOpenChange, center }: ProductionCenterDialogProps) {
  const { createCenter, updateCenter, isCreating, isUpdating } = useProductionCenters();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [icon, setIcon] = useState("ChefHat");
  const [printerName, setPrinterName] = useState("");
  const [printerIp, setPrinterIp] = useState("");
  const [printerPort, setPrinterPort] = useState<string>("9100");
  const [printComplete, setPrintComplete] = useState(false);

  const isEditing = !!center;
  const isSubmitting = isCreating || isUpdating;

  useEffect(() => {
    if (center) {
      setName(center.name);
      setColor(center.color);
      setIcon(center.icon);
      setPrinterName(center.printer_name || "");
      setPrinterIp(center.printer_ip || "");
      setPrinterPort(String(center.printer_port ?? 9100));
      setPrintComplete(center.print_complete ?? false);
    } else {
      setName("");
      setColor("#3b82f6");
      setIcon("ChefHat");
      setPrinterName("");
      setPrinterIp("");
      setPrinterPort("9100");
      setPrintComplete(false);
    }
  }, [center, open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    const portNumber = parseInt(printerPort, 10);
    const safePort = Number.isFinite(portNumber) && portNumber > 0 ? portNumber : 9100;

    try {
      const payload = {
        name: name.trim(),
        color,
        icon,
        printer_name: printerName.trim() || null,
        printer_ip: printerIp.trim() || null,
        printer_port: safePort,
        print_complete: printComplete,
      };
      if (isEditing && center) {
        await updateCenter({ id: center.id, ...payload });
      } else {
        await createCenter(payload);
      }
      onOpenChange(false);
    } catch (e) {
      // toast handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar" : "Novo"} Centro de Produção</DialogTitle>
          <DialogDescription>
            Defina uma estação de preparo (ex: Sushi Bar, Pratos Quentes, Bar)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              placeholder="Ex: Sushi Bar"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="grid grid-cols-8 gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-md border-2 transition-all",
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ícone</Label>
            <div className="grid grid-cols-5 gap-2">
              {ICON_OPTIONS.map(({ name: iconName, Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  className={cn(
                    "h-10 rounded-md border flex items-center justify-center transition-all",
                    icon === iconName
                      ? "border-foreground bg-accent"
                      : "border-border hover:bg-accent/50"
                  )}
                >
                  <Icon className="h-5 w-5" style={{ color }} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="printer-name">Rótulo da impressora (opcional)</Label>
            <Input
              id="printer-name"
              placeholder="Ex: Bematech-Cozinha"
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-[1fr_100px] gap-2">
            <div className="space-y-2">
              <Label htmlFor="printer-ip">IP ou nome da impressora</Label>
              <Input
                id="printer-ip"
                placeholder="192.168.1.50 ou COM3 ou Epson TM-T20"
                value={printerIp}
                onChange={(e) => setPrinterIp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="printer-port">Porta TCP</Label>
              <Input
                id="printer-port"
                type="number"
                placeholder="9100"
                value={printerPort}
                onChange={(e) => setPrinterPort(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Aceita IP de rede (192.168.1.50), porta serial (COM3, LPT1) ou nome exato da impressora no Windows. Porta TCP usada apenas para impressoras de rede.
          </p>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Impressão Completa (Comanda Caixa)</Label>
              <p className="text-xs text-muted-foreground">
                Imprime todos os itens + dados de entrega em cada pedido de delivery
              </p>
            </div>
            <Switch checked={printComplete} onCheckedChange={setPrintComplete} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting}>
            {isSubmitting ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
