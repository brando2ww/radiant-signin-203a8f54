import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

/**
 * Detecta impressoras que pararam de imprimir, usando o próprio pdv_print_jobs:
 *  - status='failed' recente  → a impressora tentou e falhou (ex: timeout/offline)
 *  - status='pending' parado  → ninguém processou (Print Bridge possivelmente offline)
 *
 * Alimenta o PrinterAlertBanner. Atualiza via Realtime + refetch periódico
 * (o pending "envelhece" sem emitir evento). Janela de 30 min faz o alerta
 * sumir sozinho quando a impressora volta a imprimir.
 */
export interface PrinterProblem {
  key: string;
  centerName: string;
  printerIp: string | null;
  failedCount: number;
  stuckPending: number;
  lastError: string | null;
  lastAt: string; // ISO do problema mais recente
}

export interface PrinterAlerts {
  problems: PrinterProblem[];
  bridgeOffline: boolean;
}

const FAILED_WINDOW_MS = 30 * 60 * 1000; // falhas dos últimos 30 min
const PENDING_STALE_MS = 3 * 60 * 1000; // pending preso há > 3 min
const LOOKBACK_MS = 2 * 60 * 60 * 1000; // busca 2h para trás

export function usePrinterAlerts(): PrinterAlerts {
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["printer-alerts", visibleUserId],
    enabled: !!visibleUserId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PrinterAlerts> => {
      const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
      const { data: rows, error } = await supabase
        .from("pdv_print_jobs")
        .select("center_name, printer_ip, status, error_message, created_at")
        .eq("tenant_user_id", visibleUserId!)
        .in("status", ["failed", "pending"])
        .gte("created_at", since);
      if (error) throw error;

      const now = Date.now();
      const map = new Map<string, PrinterProblem>();

      for (const r of (rows ?? []) as any[]) {
        const createdMs = new Date(r.created_at).getTime();
        const isRecentFail = r.status === "failed" && now - createdMs <= FAILED_WINDOW_MS;
        const isStuckPending = r.status === "pending" && now - createdMs >= PENDING_STALE_MS;
        if (!isRecentFail && !isStuckPending) continue;

        const key = `${r.center_name ?? "—"}::${r.printer_ip ?? "—"}`;
        const cur = map.get(key) ?? {
          key,
          centerName: r.center_name ?? "Sem centro",
          printerIp: r.printer_ip ?? null,
          failedCount: 0,
          stuckPending: 0,
          lastError: null,
          lastAt: r.created_at,
        };
        if (isRecentFail) {
          cur.failedCount += 1;
          if (r.error_message) cur.lastError = r.error_message;
        }
        if (isStuckPending) cur.stuckPending += 1;
        if (new Date(r.created_at).getTime() > new Date(cur.lastAt).getTime()) {
          cur.lastAt = r.created_at;
        }
        map.set(key, cur);
      }

      const problems = Array.from(map.values()).sort(
        (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
      );
      // Se várias impressoras têm fila parada ao mesmo tempo, o mais provável
      // é o Print Bridge estar offline (e não cada impressora individualmente).
      const printersWithStuck = problems.filter((p) => p.stuckPending > 0).length;
      const bridgeOffline = printersWithStuck >= 2;

      return { problems, bridgeOffline };
    },
  });

  // Realtime: qualquer mudança em pdv_print_jobs do tenant recomputa o alerta.
  useEffect(() => {
    if (!visibleUserId) return;
    const channel = supabase
      .channel(`printer-alerts-${visibleUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pdv_print_jobs",
          filter: `tenant_user_id=eq.${visibleUserId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["printer-alerts", visibleUserId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [visibleUserId, queryClient]);

  return data ?? { problems: [], bridgeOffline: false };
}
