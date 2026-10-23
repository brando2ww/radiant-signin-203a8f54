import { forwardRef, useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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

/** Compara sem acento, sem caixa e sem espaço sobrando: "Porções " = "porcoes". */
export function normalizarCategoria(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Singular grosseiro (tira o "s" final de cada palavra), só para aproximar
// "Bebida" de "Bebidas" e "Dose" de "Doses". Não precisa acertar plural
// irregular: serve para SUGERIR a categoria que já existe, nunca para trocar
// o que o usuário digitou.
function singular(normalizado: string) {
  return normalizado
    .split(" ")
    .map((p) => (p.length > 3 ? p.replace(/s$/, "") : p))
    .join(" ");
}

interface CategoryComboboxProps
  extends Omit<React.ComponentPropsWithoutRef<"button">, "value" | "onChange"> {
  value: string;
  onChange: (categoria: string) => void;
  /** Categorias já usadas nos produtos da loja. */
  categories: string[];
  /**
   * Onde montar a lista. Dentro de um Dialog, passar o DialogContent: portada
   * no body, a lista fica fora da área que o Dialog libera para rolar, e a
   * roda do mouse não rola a lista.
   */
  container?: HTMLElement | null;
}

/**
 * Categoria do produto: escolhe uma que já existe ou cria outra digitando.
 * Antes era um campo de texto livre, e cada um digitava de um jeito ("Bebida",
 * "Bebidas", "bebidas"), o que espalhava o mesmo grupo em várias categorias no
 * PDV, no cardápio do garçom e nos relatórios.
 */
export const CategoryCombobox = forwardRef<HTMLButtonElement, CategoryComboboxProps>(
  ({ value, onChange, categories, container, className, ...buttonProps }, ref) => {
    const [open, setOpen] = useState(false);
    const [busca, setBusca] = useState("");

    // Esc fecha SÓ a lista, não o cadastro inteiro. O Dialog e o Popover usam
    // cópias diferentes do @radix-ui/react-dismissable-layer (o react-dialog
    // traz a dele aninhada no node_modules), então um não enxerga o outro como
    // camada: o Dialog se acha a camada de cima e fecha junto, levando o que
    // já foi preenchido. Escutar na captura do window chega antes dos dois
    // (eles escutam no document) e corta o evento ali.
    useEffect(() => {
      if (!open) return;
      const aoTeclar = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        setOpen(false);
      };
      window.addEventListener("keydown", aoTeclar, true);
      return () => window.removeEventListener("keydown", aoTeclar, true);
    }, [open]);

    // A categoria atual entra na lista mesmo que nenhum produto salvo a use
    // ainda (acabou de ser criada aqui, antes de salvar).
    const opcoes = useMemo(() => {
      const atual = value?.trim();
      if (!atual || categories.includes(atual)) return categories;
      return [...categories, atual].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
      );
    }, [categories, value]);

    const termo = busca.trim();
    const termoNorm = normalizarCategoria(termo);

    // Filtro próprio (shouldFilter={false} no Command): o do cmdk não ignora
    // acento e ordena por um score que às vezes põe a parecida embaixo.
    const filtradas = useMemo(() => {
      if (!termoNorm) return opcoes;
      const termoSing = singular(termoNorm);
      const ranqueadas: { categoria: string; rank: number }[] = [];
      for (const categoria of opcoes) {
        const norm = normalizarCategoria(categoria);
        let rank = -1;
        if (norm === termoNorm) rank = 0;
        else if (singular(norm) === termoSing) rank = 1;
        else if (norm.startsWith(termoNorm)) rank = 2;
        else if (norm.split(" ").some((p) => p.startsWith(termoNorm))) rank = 3;
        else if (norm.includes(termoNorm)) rank = 4;
        if (rank >= 0) ranqueadas.push({ categoria, rank });
      }
      // sort é estável: dentro do mesmo rank segue a ordem alfabética.
      return ranqueadas.sort((a, b) => a.rank - b.rank).map((r) => r.categoria);
    }, [opcoes, termoNorm]);

    // Só oferece criar quando não existe nenhuma igual ignorando acento e caixa.
    const existeIgual = !!termoNorm && opcoes.some((c) => normalizarCategoria(c) === termoNorm);
    const podeCriar = !!termo && !existeIgual;

    const escolher = (categoria: string) => {
      onChange(categoria);
      setOpen(false);
    };

    return (
      // Sem `modal`: aninhado no Dialog, o modo modal do Popover disputa o
      // pointer-events do body com o Dialog (ver IngredientCombobox).
      <Popover
        open={open}
        onOpenChange={(proximo) => {
          setOpen(proximo);
          if (proximo) setBusca("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            title={value || undefined}
            className={cn("h-10 w-full justify-between font-normal", className)}
            {...buttonProps}
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || "Selecione ou crie uma categoria"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          collisionPadding={12}
          container={container}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar ou criar categoria..."
              value={busca}
              onValueChange={setBusca}
            />
            <CommandList className="max-h-[260px]">
              <CommandEmpty>
                {categories.length === 0
                  ? "Nenhuma categoria ainda. Digite o nome da primeira."
                  : "Nenhuma categoria encontrada."}
              </CommandEmpty>
              {filtradas.length > 0 && (
                <CommandGroup heading={termo ? "Categorias existentes" : undefined}>
                  {filtradas.map((categoria) => (
                    <CommandItem
                      key={categoria}
                      value={categoria}
                      onSelect={() => escolher(categoria)}
                      title={categoria}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          value === categoria ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{categoria}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {/* Por último de propósito: o cmdk destaca o primeiro item, então
                  o Enter pega a categoria parecida que já existe ("Bebidas")
                  antes de criar outra ("Bebida"). */}
              {podeCriar && (
                <CommandGroup>
                  <CommandItem
                    value={`__criar__:${termo}`}
                    onSelect={() => escolher(termo.replace(/\s+/g, " "))}
                  >
                    <Plus className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">
                      Criar categoria «{termo.replace(/\s+/g, " ")}»
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);
CategoryCombobox.displayName = "CategoryCombobox";
