import { Button } from "@/components/ui/button";
import { LayoutGrid, Plus, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export const EmptyState = ({
  icon: Icon = LayoutGrid,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-lg border border-dashed bg-card ${
        compact ? "py-8 px-4" : "py-16 px-6"
      }`}
    >
      <div className="rounded-full bg-muted p-3 mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-base mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} size={compact ? "sm" : "default"}>
          <Plus className="h-4 w-4 mr-2" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
