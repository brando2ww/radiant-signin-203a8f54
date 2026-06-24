import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProductionCenters, ProductionCenter } from "@/hooks/use-production-centers";
import {
  Plus, Edit, Trash2, Printer, Info, ChefHat, Wine, Coffee, Cake, Pizza, Soup,
  Sandwich, IceCream, Beer, Utensils, MoreVertical, Settings, Wifi,
} from "lucide-react";
import { ProductionCenterDialog } from "./ProductionCenterDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";
import { usePrinterStatus, type PrinterStatusMap } from "@/hooks/use-printer-status";

const ICON_MAP: Record<string, any> = {
  ChefHat, Wine, Coffee, Cake, Pizza, Soup, Sandwich, IceCream, Beer, Utensils,
};

const BRIDGE_URL = "http://localhost:7777";

type PrinterStatus = PrinterStatusMap[string];

function CenterIcon({ name, color, className }: { name: string; color: string; className?: string }) {
  const Icon = ICON_MAP[name] || ChefHat;
  return <Icon className={className} style={{ color }} />;
}

function StatusDot({ status }: { status: PrinterStatus }) {
  const color = !status ? "bg-muted-foreground/40" : status.ok ? "bg-emerald-500" : "bg-destructive";
  const title = !status
    ? "Nunca testada"
    : status.ok
      ? `Online — teste em ${new Date(status.at).toLocaleString("pt-BR")}`
      : `Falhou — ${status.error ?? ""}`;
  return <span className={cn("h-2 w-2 rounded-full shrink-0", color)} title={title} />;
}

export function ProductionCentersTab() {
  const { centers, isLoading, deleteCenter, isDeleting } = useProductionCenters();
  const { statuses, recordStatus } = usePrinterStatus();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<ProductionCenter | null>(null);
  const [deletingCenter, setDeletingCenter] = useState<ProductionCenter | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const handleEdit = (center: ProductionCenter) => {
    setEditingCenter(center);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingCenter(null);
    setDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCenter) return;
    await deleteCenter(deletingCenter.id);
    setDeletingCenter(null);
  };

  const handleTestPrinter = async (center: ProductionCenter) => {
    if (!center.printer_ip) {
      toast.error("Configure o endereço da impressora primeiro (IP, COM3 ou nome Windows)");
      return;
    }
    setTestingId(center.id);
    try {
      const printerTarget = center.printer_ip!;
      const isTcpIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(printerTarget.trim());
      const res = await fetch(`${BRIDGE_URL}/test-print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isTcpIp
            ? { ip: printerTarget, port: center.printer_port ?? 9100, centerName: center.name }
            : { printerName: printerTarget, centerName: center.name }
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        await recordStatus({ productionCenterId: center.id, ok: true });
        toast.success(`Impressora [${center.printer_ip}] respondeu`);
      } else {
        const error = body.error || `HTTP ${res.status}`;
        await recordStatus({ productionCenterId: center.id, ok: false, error });
        toast.error(`Falha ao imprimir: ${error}`);
      }
    } catch (e: any) {
      await recordStatus({ productionCenterId: center.id, ok: false, error: "Bridge offline" });
      toast.error("Print Bridge offline — inicie o serviço no PC do caixa");
    } finally {
      setTestingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Cada produto é roteado para um centro específico. Quando o garçom lança a comanda,
          os itens são impressos automaticamente na bancada correspondente via Print Bridge
          (TCP porta 9100).
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Centro
        </Button>
      </div>

      {centers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum centro de produção cadastrado</p>
            <p className="text-sm">Clique em "Novo Centro" para começar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {centers.map((center) => {
            const status = statuses[center.id];
            const hasPrinter = !!center.printer_ip;
            return (
              <Card key={center.id} className="flex flex-col">
                <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                  <div
                    className="h-12 w-12 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${center.color}20` }}
                  >
                    <CenterIcon name={center.icon} color={center.color} className="h-6 w-6" />
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-mr-2 -mt-2">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => deferMenuAction(() => handleEdit(center))}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleTestPrinter(center)}
                        disabled={!hasPrinter || testingId === center.id}
                      >
                        <Wifi className="h-4 w-4 mr-2" />
                        {testingId === center.id ? "Testando..." : "Testar impressora"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deferMenuAction(() => setDeletingCenter(center))}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>

                <CardContent className="flex-1 space-y-2 pb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">{center.name}</CardTitle>
                    <Badge variant="outline" className="text-xs font-mono">
                      {center.slug}
                    </Badge>
                  </div>
                  {hasPrinter ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <StatusDot status={status} />
                      <Printer className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-mono">
                        {center.printer_ip}:{center.printer_port ?? 9100}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                      <Printer className="h-3.5 w-3.5 shrink-0 opacity-50" />
                      Sem impressora configurada
                    </p>
                  )}
                  {center.printer_name && hasPrinter && (
                    <p className="text-xs text-muted-foreground truncate">{center.printer_name}</p>
                  )}
                </CardContent>

                <div className="border-t">
                  <button
                    onClick={() => (hasPrinter ? handleTestPrinter(center) : handleEdit(center))}
                    disabled={testingId === center.id}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors rounded-b-lg disabled:opacity-60"
                  >
                    {hasPrinter ? (
                      <>
                        <Wifi className="h-4 w-4" />
                        {testingId === center.id ? "Testando..." : "Testar impressora"}
                      </>
                    ) : (
                      <>
                        <Settings className="h-4 w-4" />
                        Configurar impressora
                      </>
                    )}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ProductionCenterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        center={editingCenter}
      />

      <AlertDialog open={!!deletingCenter} onOpenChange={(o) => !o && setDeletingCenter(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover centro de produção?</AlertDialogTitle>
            <AlertDialogDescription>
              Os produtos vinculados a <strong>{deletingCenter?.name}</strong> continuarão
              existindo, mas precisarão ser reatribuídos a outro centro. Esta ação pode ser
              revertida no banco de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
