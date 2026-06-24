import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SettingsSaveBarProps {
  isDirty: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
}

export function SettingsSaveBar({ isDirty, isSubmitting, onCancel }: SettingsSaveBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur-sm transition-all duration-200",
        isDirty ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      )}
    >
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Alterações não salvas</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}
