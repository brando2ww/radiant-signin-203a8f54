import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Eye } from "lucide-react";
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

  // Nomes longos ("Bandeja Termica Aluminio 8 Marmitex C/ Tampa") não cabem na
  // largura do campo e viram "...". O botão do olho só aparece quando o texto
  // REALMENTE foi cortado — medido no DOM, não por contagem de caracteres, que
  // erraria conforme a fonte e a largura do diálogo.
  const labelRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    setTruncated(el.scrollWidth > el.clientWidth + 1);
  }, [selected?.name]);

  // O diálogo muda de largura (janela, zoom), então a medida precisa acompanhar.
  useEffect(() => {
    const el = labelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setTruncated(el.scrollWidth > el.clientWidth + 1),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            // title = atalho no desktop: passar o mouse já mostra o nome inteiro.
            title={selected?.name}
            className="w-full min-w-0 flex-1 justify-between font-normal"
          >
            <span
              ref={labelRef}
              className={cn("truncate", !selected && "text-muted-foreground")}
            >
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
                    title={ing.name}
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

      {/* Só existe quando o nome não coube. Popover (e não tooltip de hover)
          porque o PDV roda em tablet, onde não há mouse para passar por cima. */}
      {truncated && selected && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-8 shrink-0 text-muted-foreground"
              aria-label={`Ver nome completo: ${selected.name}`}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto max-w-[280px] p-2 text-sm"
            align="end"
            collisionPadding={12}
          >
            <p className="font-medium break-words">{selected.name}</p>
            {selected.unit && (
              <p className="mt-1 text-xs text-muted-foreground">
                Unidade: {selected.unit}
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
