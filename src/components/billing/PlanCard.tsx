import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PlanFeature {
  label: string;
}

export interface PlanCardProps {
  id: string;
  name: string;
  description: string;
  price: number;
  features: PlanFeature[];
  isActive?: boolean;
  isSelected?: boolean;
  isCompleto?: boolean;
  onSelect?: (id: string) => void;
  onSubscribe?: (id: string) => void;
  isLoading?: boolean;
  actionLabel?: string;
  disabled?: boolean;
}

export function PlanCard({
  id,
  name,
  description,
  price,
  features,
  isActive = false,
  isSelected = false,
  isCompleto = false,
  onSelect,
  onSubscribe,
  isLoading = false,
  actionLabel,
  disabled = false,
}: PlanCardProps) {
  const handleClick = () => {
    if (isActive || disabled) return;
    if (onSelect) onSelect(id);
  };

  const handleSubscribe = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSubscribe) onSubscribe(id);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative rounded-xl border-2 p-5 transition-all",
        isCompleto && "col-span-full md:col-span-1",
        isActive
          ? "border-primary bg-primary/5 cursor-default"
          : isSelected
          ? "border-primary bg-primary/5 cursor-pointer"
          : disabled
          ? "border-border bg-muted/30 cursor-not-allowed opacity-60"
          : "border-border bg-card cursor-pointer hover:border-primary/50 hover:bg-accent/30"
      )}
    >
      {isActive && (
        <Badge className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-xs">
          Ativo
        </Badge>
      )}
      {isCompleto && !isActive && (
        <Badge variant="secondary" className="absolute -top-2.5 left-4 text-xs">
          Mais popular
        </Badge>
      )}

      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-base">{name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>

        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold">R$ {price.toFixed(2).replace(".", ",")}</span>
          <span className="text-xs text-muted-foreground">/mês</span>
        </div>

        <ul className="space-y-1.5">
          {features.map((f) => (
            <li key={f.label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              {f.label}
            </li>
          ))}
        </ul>

        {!isActive && (
          <Button
            className="w-full mt-2"
            size="sm"
            variant={isSelected ? "default" : isCompleto ? "default" : "outline"}
            onClick={handleSubscribe}
            disabled={disabled || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : isSelected ? (
              <Check className="h-4 w-4 mr-2" />
            ) : null}
            {actionLabel ?? (isSelected ? "Selecionado" : "Contratar")}
          </Button>
        )}

        {isActive && (
          <div className="flex items-center gap-2 text-xs text-primary font-medium pt-1">
            <Check className="h-4 w-4" />
            Módulo ativo
          </div>
        )}
      </div>
    </div>
  );
}
