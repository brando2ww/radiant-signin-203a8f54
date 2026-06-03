import { Check } from "lucide-react";

export interface ModuleEntry {
  value: string;
  label: string;
  description: string;
  bundledWith?: string[];
}

export const availableModules: ModuleEntry[] = [
  {
    value: "pdv",
    label: "PDV + Delivery",
    description: "Ponto de venda, salão, comandas, pedidos online e cardápio digital",
    bundledWith: ["delivery"],
  },
  { value: "financeiro", label: "Financeiro", description: "Contas, fluxo de caixa, DRE" },
  { value: "crm", label: "CRM", description: "Gestão de leads e clientes" },
  { value: "avaliacoes", label: "Avaliações", description: "Pesquisa de satisfação NPS" },
  { value: "tarefas", label: "Tarefas", description: "Checklists operacionais e tarefas diárias" },
];

export function moduleSlugsFor(mod: ModuleEntry): string[] {
  return [mod.value, ...(mod.bundledWith ?? [])];
}

interface ModuleSelectorProps {
  selected: string[];
  onChange: (modules: string[]) => void;
}

export function ModuleSelector({ selected, onChange }: ModuleSelectorProps) {
  const toggle = (mod: ModuleEntry) => {
    const slugs = moduleSlugsFor(mod);
    const allSelected = slugs.every((s) => selected.includes(s));
    if (allSelected) {
      onChange(selected.filter((m) => !slugs.includes(m)));
    } else {
      const next = new Set(selected);
      slugs.forEach((s) => next.add(s));
      onChange(Array.from(next));
    }
  };

  return (
    <div className="space-y-3">
      {availableModules.map((mod) => {
        const slugs = moduleSlugsFor(mod);
        const isSelected = slugs.every((s) => selected.includes(s));

        return (
          <button
            key={mod.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => toggle(mod)}
            className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
          >
            <div
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary ring-offset-background"
              aria-hidden="true"
            >
              {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
            <div>
              <div className="font-medium">{mod.label}</div>
              <p className="text-xs text-muted-foreground">{mod.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
