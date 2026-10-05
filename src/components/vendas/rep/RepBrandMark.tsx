import { useState } from "react";
import { cn } from "@/lib/utils";
import type { RepBrand } from "@/hooks/use-vendas-rep";
import { initials } from "./rep-utils";

/** Logo do estabelecimento; sem logo (ou se a imagem falhar), as iniciais na cor da marca. */
export function RepBrandMark({ brand, className }: { brand: RepBrand; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (brand.logoUrl && !failed) {
    return (
      <img
        src={brand.logoUrl}
        alt={brand.name || "Logo"}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-lg border bg-white object-contain p-0.5", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground",
        className,
      )}
      style={brand.primaryColor ? { backgroundColor: brand.primaryColor, color: "#fff" } : undefined}
    >
      {initials(brand.name || "Força de vendas")}
    </span>
  );
}
