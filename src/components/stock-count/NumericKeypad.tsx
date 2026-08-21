import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

const TECLAS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ",", "0", "apagar"] as const;

/**
 * Teclado numérico da própria página.
 *
 * O teclado do sistema é pequeno, cobre metade da tela e some no meio da
 * digitação. Quem conta estoque está de luva, no frio, com a outra mão ocupada
 * — precisa de alvo grande e de um lugar fixo na tela.
 */
export function NumericKeypad({ value, onChange, className }: Props) {
  const digitar = (t: string) => {
    if (t === "apagar") {
      onChange(value.slice(0, -1));
      return;
    }
    if (t === ",") {
      // Uma vírgula só, e nunca abrindo o número.
      if (value.includes(",")) return;
      onChange(value === "" ? "0," : value + ",");
      return;
    }
    // Duas casas decimais bastam para qualquer unidade de cozinha.
    const [, dec] = value.split(",");
    if (dec !== undefined && dec.length >= 2) return;
    if (value === "0") { onChange(t); return; }
    onChange(value + t);
  };

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {TECLAS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => digitar(t)}
          className={cn(
            "flex h-14 items-center justify-center rounded-lg border text-xl font-semibold transition-colors active:scale-[0.98]",
            t === "apagar" ? "bg-muted text-muted-foreground" : "bg-card hover:bg-muted/60",
          )}
          aria-label={t === "apagar" ? "Apagar" : t === "," ? "Vírgula" : t}
        >
          {t === "apagar" ? <Delete className="h-5 w-5" /> : t}
        </button>
      ))}
    </div>
  );
}

/** "12,5" → 12.5. Campo vazio é nulo, não zero: não contado ≠ contado zero. */
export function parseQtd(v: string): number | null {
  const limpo = v.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
