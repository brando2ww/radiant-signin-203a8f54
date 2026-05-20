import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Phone, MessageCircle, MapPin, MoreVertical, Pencil, Trash2, Tag } from "lucide-react";
import { PDVSupplier } from "@/hooks/use-pdv-suppliers";
import { SupplierPurchaseStat } from "@/hooks/use-supplier-purchase-stats";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SupplierCardProps {
  supplier: PDVSupplier;
  stat?: SupplierPurchaseStat;
  statsLoading?: boolean;
  onEdit: (supplier: PDVSupplier) => void;
  onDelete: (id: string) => void;
  onToggleActive: (supplier: PDVSupplier) => void;
  isToggling?: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function onlyDigits(s?: string | null) {
  return (s || "").replace(/\D/g, "");
}

export function SupplierCard({
  supplier,
  stat,
  statsLoading,
  onEdit,
  onDelete,
  onToggleActive,
  isToggling,
}: SupplierCardProps) {
  const initials = getInitials(supplier.name);
  const whatsappDigits = onlyDigits(supplier.whatsapp || supplier.phone);
  const phoneDigits = onlyDigits(supplier.phone);

  return (
    <Card className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 rounded-full bg-muted text-foreground flex items-center justify-center text-sm font-semibold">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{supplier.name}</h3>
          {supplier.company_name && (
            <p className="text-xs text-muted-foreground truncate">{supplier.company_name}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {supplier.cnpj
              ? `CNPJ: ${supplier.cnpj}`
              : supplier.cpf
              ? `CPF: ${supplier.cpf}`
              : "Sem documento"}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-2 mr-1">
            <Switch
              checked={!!supplier.is_active}
              onCheckedChange={() => onToggleActive(supplier)}
              disabled={isToggling}
              aria-label="Ativar/inativar fornecedor"
            />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {supplier.is_active ? "Ativo" : "Inativo"}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setTimeout(() => onEdit(supplier), 0);
                }}
              >
                <Pencil className="h-4 w-4 mr-2" /> Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setTimeout(() => onDelete(supplier.id), 0);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Categoria */}
      {supplier.category && (
        <div>
          <Badge variant="outline" className="gap-1">
            <Tag className="h-3 w-3" />
            {supplier.category}
          </Badge>
        </div>
      )}

      {/* Contatos */}
      <div className="space-y-1.5 text-sm">
        {phoneDigits && (
          <a
            href={`tel:${phoneDigits}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Phone className="h-4 w-4 shrink-0" />
            <span className="truncate">{supplier.phone}</span>
          </a>
        )}

        {whatsappDigits && supplier.whatsapp && (
          <a
            href={`https://wa.me/${whatsappDigits.length <= 11 ? "55" + whatsappDigits : whatsappDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">{supplier.whatsapp}</span>
          </a>
        )}

        {supplier.email && (
          <a
            href={`mailto:${supplier.email}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{supplier.email}</span>
          </a>
        )}

        {(supplier.city || supplier.state) && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {[supplier.city, supplier.state].filter(Boolean).join(" - ")}
            </span>
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="mt-auto pt-3 border-t grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Compras no mês</p>
          {statsLoading ? (
            <Skeleton className="h-4 w-20 mt-1" />
          ) : (
            <p className="font-medium text-foreground">{formatBRL(stat?.monthTotal || 0)}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">Última compra</p>
          {statsLoading ? (
            <Skeleton className="h-4 w-20 mt-1 ml-auto" />
          ) : (
            <p className="font-medium text-foreground">
              {stat?.lastPurchaseAt
                ? format(new Date(stat.lastPurchaseAt), "dd/MM/yyyy", { locale: ptBR })
                : "—"}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
