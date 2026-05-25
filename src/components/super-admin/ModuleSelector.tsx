import { Check } from "lucide-react";

export const availableModules = [
  { value: "pdv", label: "PDV", description: "Ponto de venda, caixa, salão, comandas" },
  { value: "delivery", label: "Delivery", description: "Pedidos online, cardápio digital" },
  { value: "financeiro", label: "Financeiro", description: "Contas, fluxo de caixa, DRE" },
  { value: "crm", label: "CRM", description: "Gestão de leads e clientes" },
  { value: "avaliacoes", label: "Avaliações", description: "Pesquisa de satisfação NPS" },
  { value: "tarefas", label: "Tarefas", description: "Checklists operacionais e tarefas diárias" },
];

interface ModuleSelectorProps {
  selected: string[];
  onChange: (modules: string[]) => void;
}

export function ModuleSelector({ selected, onChange }: ModuleSelectorProps) {
  const toggle = (mod: string) => {
    onChange(
      selected.includes(mod)
        ? selected.filter((m) => m !== mod)
        : [...selected, mod]
    );
  };

  return (
    <div className="space-y-3">
      {availableModules.map((mod) => {
        const isSelected = selected.includes(mod.value);

        return (
          <button
            key={mod.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => toggle(mod.value)}
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
