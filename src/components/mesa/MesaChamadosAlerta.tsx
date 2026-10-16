import { useEffect, useRef } from "react";
import { Bell, Receipt, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserModules } from "@/hooks/use-user-modules";
import { useMesaChamados } from "@/hooks/use-mesa-digital";
import { formatTableLabel } from "@/utils/formatTableNumber";

/** Bipe curto pela Web Audio (o /notification.mp3 do projeto não existe). */
function bipar() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.22].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* navegador sem áudio */
  }
}

const minutos = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "agora" : `há ${m} min`;
};

/**
 * Chamados da Mesa Digital ("chamar garçom" e "pedir a conta") para a equipe.
 * Fica no PDV e no app do garçom; só aparece com o módulo ligado.
 */
export function MesaChamadosAlerta({ compacto = false }: { compacto?: boolean }) {
  const { hasModule } = useUserModules();
  const ligado = hasModule("mesa");
  const { chamados, atender } = useMesaChamados(ligado);
  const vistos = useRef<Set<string> | null>(null);

  useEffect(() => {
    const ids = new Set(chamados.map((c) => c.id));
    if (vistos.current) {
      const novo = chamados.some((c) => !vistos.current!.has(c.id));
      if (novo) bipar();
    }
    vistos.current = ids;
  }, [chamados]);

  if (!ligado || chamados.length === 0) return null;

  return (
    <div
      className={cn(
        "fixed z-50 w-[min(22rem,calc(100vw-1.5rem))] space-y-2",
        compacto ? "left-1/2 top-3 -translate-x-1/2" : "bottom-4 right-4",
      )}
    >
      {chamados.map((c) => (
        <div
          key={c.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border p-3 shadow-lg",
            c.tipo === "conta" ? "border-amber-300 bg-amber-50" : "border-sky-300 bg-sky-50",
          )}
        >
          {c.tipo === "conta" ? (
            <Receipt className="h-5 w-5 shrink-0 text-amber-700" />
          ) : (
            <Bell className="h-5 w-5 shrink-0 animate-pulse text-sky-700" />
          )}
          <div className="min-w-0 flex-1 text-sm text-slate-900">
            <p className="font-semibold">
              {c.mesa ? formatTableLabel(c.mesa) : "Mesa"} ·{" "}
              {c.tipo === "conta" ? "pediu a conta" : "chamou o garçom"}
            </p>
            <p className="truncate text-xs text-slate-600">
              {c.nome ? `${c.nome} · ` : ""}
              {minutos(c.criado_em)} · pelo QR
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 bg-white" onClick={() => atender.mutate(c.id)}>
            <Check className="mr-1 h-4 w-4" /> Atendido
          </Button>
        </div>
      ))}
    </div>
  );
}
