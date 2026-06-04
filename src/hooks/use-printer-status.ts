import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

export type PrinterStatusRow = {
  production_center_id: string;
  is_online: boolean;
  last_tested_at: string;
  last_error: string | null;
};

export type PrinterStatusMap = Record<
  string,
  { ok: boolean; at: number; error?: string } | null
>;

export function usePrinterStatus() {
  const { visibleUserId } = useEstablishmentId();
  const deviceId = getDeviceFingerprint();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["pdv_printer_status", visibleUserId, deviceId],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<PrinterStatusMap> => {
      const { data, error } = await supabase
        .from("pdv_printer_status")
        .select("production_center_id,is_online,last_tested_at,last_error")
        .eq("owner_user_id", visibleUserId!)
        .eq("device_id", deviceId);
      if (error) throw error;
      const map: PrinterStatusMap = {};
      (data ?? []).forEach((r: any) => {
        map[r.production_center_id] = {
          ok: !!r.is_online,
          at: new Date(r.last_tested_at).getTime(),
          error: r.last_error ?? undefined,
        };
      });
      return map;
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: {
      productionCenterId: string;
      ok: boolean;
      error?: string;
    }) => {
      if (!visibleUserId) throw new Error("Sem estabelecimento");
      const { error } = await supabase
        .from("pdv_printer_status")
        .upsert(
          {
            device_id: deviceId,
            production_center_id: input.productionCenterId,
            owner_user_id: visibleUserId,
            is_online: input.ok,
            last_error: input.error ?? null,
            last_tested_at: new Date().toISOString(),
          },
          { onConflict: "device_id,production_center_id" }
        );
      if (error) throw error;
      return input;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv_printer_status", visibleUserId, deviceId] });
    },
  });

  return {
    statuses: query.data ?? {},
    recordStatus: mutation.mutateAsync,
  };
}
