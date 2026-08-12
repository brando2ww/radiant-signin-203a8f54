import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label: string;
}

/**
 * Seleção com busca para os filtros do relatório. Mesmo padrão do
 * IngredientCombobox: com dezenas de fornecedores e categorias, rolar a lista
 * do Select até achar um nome é inviável.
 */
export function FilterCombobox({
  label,
  value,
  options,
  allLabel,
  onChange,
  width = "w-[190px]",
}: {
  label: string;
  value: string;
  options: ComboOption[];
  allLabel: string;
  onChange: (value: string) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("h-9 justify-between text-xs font-normal", width)}
          >
            <span className="truncate">{selected?.label ?? allLabel}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Buscar ${label.toLowerCase()}...`} className="h-9" />
            <CommandList>
              <CommandEmpty>Nada encontrado.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={allLabel}
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", !selected ? "opacity-100" : "opacity-0")} />
                  {allLabel}
                </CommandItem>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    // O Command filtra pelo `value`: usar o rótulo aqui é o que
                    // faz a busca por nome funcionar (o id seria inútil).
                    value={o.label}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === o.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
