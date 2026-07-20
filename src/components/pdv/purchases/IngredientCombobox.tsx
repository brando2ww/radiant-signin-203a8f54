import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface IngredientOption {
  id: string;
  name: string;
  unit?: string;
}

interface IngredientComboboxProps {
  ingredients: IngredientOption[];
  value: string;
  onChange: (ingredientId: string) => void;
}

/**
 * Seleção de ingrediente com busca. Substitui o Select nativo: com centenas de
 * insumos, rolar a lista até achar "Vinagre Branco" é inviável, e o popup do
 * Select abria pra fora da área visível do diálogo.
 */
export function IngredientCombobox({
  ingredients,
  value,
  onChange,
}: IngredientComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = ingredients.find((i) => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Selecione..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        // Evita que a lista abra fora da tela quando o item está no fim do diálogo.
        collisionPadding={12}
      >
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Buscar ingrediente..." />
          <CommandList className="max-h-[240px]">
            <CommandEmpty>Nenhum ingrediente encontrado.</CommandEmpty>
            <CommandGroup>
              {ingredients.map((ing) => (
                <CommandItem
                  key={ing.id}
                  // O value é o que a busca enxerga — precisa ser o nome, não o id.
                  value={ing.name}
                  onSelect={() => {
                    onChange(ing.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === ing.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{ing.name}</span>
                  {ing.unit && (
                    <span className="ml-auto pl-2 text-xs text-muted-foreground shrink-0">
                      {ing.unit}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
