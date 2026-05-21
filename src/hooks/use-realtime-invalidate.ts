import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RealtimeTableConfig {
  /** Table name in the public schema. */
  table: string;
  /** Query keys to invalidate on any change to the table. */
  keys: QueryKey[];
  /** Optional Realtime filter, e.g. `user_id=eq.<uuid>`. */
  filter?: string;
}

interface Options {
  /** Unique channel identifier (per-area). */
  channel: string;
  tables: RealtimeTableConfig[];
  enabled?: boolean;
}

/**
 * Subscribes to Supabase Realtime Postgres changes for the given tables and
 * invalidates the associated React Query keys. Invalidations are debounced to
 * coalesce bursts (e.g. batch inserts).
 */
export function useRealtimeInvalidate({ channel, tables, enabled = true }: Options) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      const keys = Array.from(pending).map((s) => JSON.parse(s) as QueryKey);
      pending.clear();
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    };

    const schedule = (keys: QueryKey[]) => {
      keys.forEach((k) => pending.add(JSON.stringify(k)));
      if (timer) return;
      timer = setTimeout(flush, 150);
    };

    const ch = supabase.channel(`realtime:${channel}`);

    tables.forEach(({ table, keys, filter }) => {
      (ch as any).on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        () => schedule(keys),
      );
    });

    ch.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, enabled, JSON.stringify(tables.map((t) => ({ t: t.table, f: t.filter, k: t.keys })))]);
}
