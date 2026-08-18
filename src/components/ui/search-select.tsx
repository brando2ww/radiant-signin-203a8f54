import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface SearchSelectOption {
  value: string;
  /** Texto que a busca enxerga e que aparece na linha. */
  label: string;
  /** Segunda linha, opcional (código, banco, CNPJ). */
  hint?: string;
  /** Cabeçalho do grupo. Opções sem grupo ficam soltas no topo. */
  group?: string;
}

interface Props {
  options: SearchSelectOption[];
  value?: string | null;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  title?: string;
  /** Permite limpar a escolha. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Seletor com busca, em diálogo empilhado.
 *
 * Dois motivos para não ser um Popover: dentro de um Dialog o Radix prende o
 * foco e o popover não recebe clique; e a lista herdaria a largura do campo,
 * o que inviabiliza plano de contas com mais de cem linhas.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Selecione",
  searchPlaceholder = "Buscar...",
  emptyText = "Nada encontrado.",
  title = "Selecionar",
  clearable = true,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  // Preserva a ordem em que os grupos aparecem — no plano de contas isso é a
  // ordem por código, que é como o financeiro lê.
  const grupos = useMemo(() => {
    const mapa = new Map<string, SearchSelectOption[]>();
    for (const o of options) {
      const k = o.group ?? "";
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(o);
    }
    return Array.from(mapa.entries());
  }, [options]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <Command
            // A busca precisa achar por código e por nome; o filtro padrão só
            // olha o `value` do item, então casamos contra label + hint.
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder={searchPlaceholder} className="h-10" />
            <CommandList className="max-h-[55vh]">
              <CommandEmpty>{emptyText}</CommandEmpty>
              {clearable && selected && (
                <CommandGroup>
                  <CommandItem
                    value="__limpar__ limpar seleção"
                    onSelect={() => { onChange(undefined); setOpen(false); }}
                  >
                    <X className="mr-2 h-4 w-4 opacity-60" />
                    Limpar seleção
                  </CommandItem>
                </CommandGroup>
              )}
              {grupos.map(([grupo, itens]) => (
                <CommandGroup key={grupo || "__sem_grupo__"} heading={grupo || undefined}>
                  {itens.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={`${o.label} ${o.hint ?? ""} ${grupo}`}
                      onSelect={() => { onChange(o.value); setOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{o.label}</span>
                      {o.hint && (
                        <span className="ml-auto pl-2 shrink-0 text-xs text-muted-foreground">{o.hint}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
