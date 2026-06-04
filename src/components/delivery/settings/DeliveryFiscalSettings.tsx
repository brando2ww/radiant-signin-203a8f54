import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useFiscalConfig } from "@/hooks/use-fiscal-config";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export function DeliveryFiscalSettings() {
  const { config } = useFiscalConfig();
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["delivery-settings-fiscal", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return null;
      const { data } = await supabase
        .from("delivery_settings" as any)
        .select("user_id, nfce_auto_emit")
        .eq("user_id", visibleUserId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!visibleUserId,
  });

  const toggle = useMutation({
    mutationFn: async (value: boolean) => {
      if (!visibleUserId) throw new Error("Sem usuário");
      const { error } = await supabase
        .from("delivery_settings" as any)
        .upsert({ user_id: visibleUserId, nfce_auto_emit: value }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-settings-fiscal"] });
      toast.success("Configuração atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const fiscalAtivo = !!config?.focusnfe_empresa_id && config?.habilita_nfce;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {fiscalAtivo ? (
            <><CheckCircle2 className="h-5 w-5 text-green-600" />Emissão fiscal disponível</>
          ) : (
            <><AlertCircle className="h-5 w-5 text-yellow-600" />Emissão fiscal indisponível</>
          )}
        </CardTitle>
        <CardDescription>
          Emite NFC-e automaticamente quando um pedido delivery é concluído e pago.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!fiscalAtivo && (
          <div className="rounded-md bg-muted p-3 text-sm">
            Configure os dados fiscais e ative a NFC-e para usar esta automação.{" "}
            <Button asChild variant="link" className="px-1 h-auto">
              <Link to="/pdv/configuracoes">Ir para Fiscal</Link>
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Emitir NFC-e automaticamente</Label>
            <p className="text-sm text-muted-foreground">
              Dispara ao mudar o status do pedido para Concluído com pagamento Pago.
            </p>
          </div>
          <Switch
            checked={!!settings?.nfce_auto_emit}
            disabled={!fiscalAtivo || toggle.isPending}
            onCheckedChange={(v) => toggle.mutate(v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
