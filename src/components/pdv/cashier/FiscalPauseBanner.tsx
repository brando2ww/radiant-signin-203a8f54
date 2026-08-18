import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFiscalPause } from "@/hooks/use-fiscal-pause";

/** "há 12 min", para quem esqueceu que pausou. */
function decorrido(desde: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${String(min % 60).padStart(2, "0")}`;
}

/**
 * Faixa fixa enquanto a emissão de NF está pausada.
 *
 * Não é toast: o operador que pausou pode não ser o mesmo que está no caixa uma
 * hora depois, e ninguém deve descobrir a pausa no fechamento.
 */
export function FiscalPauseBanner() {
  const { pause, isPaused, retomar } = useFiscalPause();
  const [, forcarRender] = useState(0);

  // Faz o "há X min" andar sozinho.
  useEffect(() => {
    if (!isPaused) return;
    const t = setInterval(() => forcarRender((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [isPaused]);

  if (!isPaused || !pause) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-amber-500 bg-amber-500/10 px-4 py-2.5">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Modo Manutenção ativo · nenhuma nota fiscal está sendo emitida
        </p>
        <p className="text-xs text-amber-800/80 dark:text-amber-200/70">
          Ativado {decorrido(pause.started_at)}
          {pause.started_by_name ? ` por ${pause.started_by_name}` : ""} · as vendas deste período
          ficam sem nota.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-600 text-amber-900 hover:bg-amber-500/20 dark:text-amber-200"
        disabled={retomar.isPending}
        onClick={() => retomar.mutate({})}
      >
        Sair da manutenção
      </Button>
    </div>
  );
}
