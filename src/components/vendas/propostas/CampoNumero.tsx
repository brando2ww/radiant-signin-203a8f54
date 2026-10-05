import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const paraTexto = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "" : String(v).replace(".", ",");

const paraNumero = (s: string) => {
  // "1.234,5" (milhar e vírgula) ou "1.5" (ponto como decimal, comum no celular).
  const t = s.includes(",") ? s.trim().replace(/\./g, "").replace(",", ".") : s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Número digitado no padrão brasileiro (vírgula), sem as manias do input type=number: aceita "1," enquanto a pessoa
 * digita e só devolve o valor quando ele é um número de verdade.
 */
export function CampoNumero({
  value,
  onChange,
  min,
  max,
  inteiro,
  sufixo,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  inteiro?: boolean;
  sufixo?: string;
}) {
  const [texto, setTexto] = useState(paraTexto(value));

  useEffect(() => {
    if (paraNumero(texto) !== value) setTexto(paraTexto(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const mudar = (s: string) => {
    const limpo = inteiro ? s.replace(/\D/g, "") : s.replace(/[^\d,.]/g, "");
    setTexto(limpo);
    let n = paraNumero(limpo);
    if (n !== null && inteiro) n = Math.trunc(n);
    if (n !== null && max !== undefined && n > max) {
      n = max;
      setTexto(paraTexto(max));
    }
    onChange(n);
  };

  const sair = () => {
    let n = paraNumero(texto);
    if (n !== null && min !== undefined && n < min) n = min;
    setTexto(paraTexto(n));
    if (n !== value) onChange(n);
  };

  return (
    <div className="relative">
      <Input
        {...props}
        inputMode={inteiro ? "numeric" : "decimal"}
        value={texto}
        onChange={(e) => mudar(e.target.value)}
        onBlur={sair}
        className={cn("tabular-nums", sufixo && "pr-8", className)}
      />
      {sufixo && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{sufixo}</span>
      )}
    </div>
  );
}
