import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFiscalPause } from "@/hooks/use-fiscal-pause";

/**
 * Faixa enquanto o Modo Manutenção está ativo.
 *
 * Deliberadamente enxuta: o botão de ativar não existe na tela (só o F11), mas
 * a saída precisa estar visível — quem assume o turno tem que conseguir
 * desligar sem conhecer o atalho.
 */
export function FiscalPauseBanner() {
  const { isPaused, retomar } = useFiscalPause();

  if (!isPaused) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border-2 border-amber-500 bg-amber-500/10 px-3 py-2">
      <Wrench className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="flex-1 text-sm font-semibold text-amber-900 dark:text-amber-200">
        Manutenção ativa
      </span>
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
