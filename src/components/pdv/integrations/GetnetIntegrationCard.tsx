// Configuração da TEF (maquininha integrada ao caixa).
//
// Quem conversa com o pinpad é a ponte instalada no computador da loja, a mesma
// que imprime. O navegador não fala com maquininha, então o caixa grava o
// pedido numa fila e a ponte executa. Aqui o lojista diz se a TEF está ligada e
// qual computador tem a maquininha.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CreditCard, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import getnetLogo from "@/assets/integrations/getnet.png";
import { useTefCobranca } from "@/hooks/use-tef";

interface Config {
  enabled: boolean;
  provider: string;
  install_id: string | null;
  terminal_label: string;
  timeout_seconds: number;
}

const PADRAO: Config = {
  enabled: false,
  provider: "bridge",
  install_id: null,
  terminal_label: "",
  timeout_seconds: 120,
};

export function GetnetIntegrationCard() {
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Config>(PADRAO);
  const [salvando, setSalvando] = useState(false);
  const tef = useTefCobranca();

  const { data: config, isLoading } = useQuery({
    queryKey: ["tef-settings-config", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data } = await supabase
        .from("pdv_tef_settings")
        .select("enabled, provider, install_id, terminal_label, timeout_seconds")
        .eq("user_id", visibleUserId!)
        .maybeSingle();
      return (data as Config) ?? null;
    },
  });

  // Pontes instaladas neste estabelecimento: é uma delas que tem a maquininha.
  const { data: pontes = [] } = useQuery({
    queryKey: ["tef-pontes", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data } = await supabase
        .from("pdv_print_bridge_status")
        .select("install_id, hostname, last_seen_at, version")
        .eq("tenant_user_id", visibleUserId!)
        .order("last_seen_at", { ascending: false });
      return data || [];
    },
  });

  useEffect(() => {
    if (config) setForm({ ...PADRAO, ...config, terminal_label: config.terminal_label || "" });
  }, [config]);

  const salvar = async () => {
    if (!visibleUserId) return;
    if (form.enabled && form.provider === "bridge" && !form.install_id) {
      toast.error("Escolha qual computador tem a maquininha");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("pdv_tef_settings").upsert(
      {
        user_id: visibleUserId,
        enabled: form.enabled,
        provider: form.provider,
        install_id: form.install_id,
        terminal_label: form.terminal_label || null,
        timeout_seconds: Number(form.timeout_seconds) || 120,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      return;
    }
    toast.success("Configuração da maquininha salva");
    queryClient.invalidateQueries({ queryKey: ["tef-settings"] });
    queryClient.invalidateQueries({ queryKey: ["tef-settings-config"] });
  };

  const testar = async () => {
    const r = await tef.cobrar({ amount: 0, paymentType: "credito" });
    if (r.status === "approved") toast.success("A maquininha respondeu");
    else toast.error(tef.erro || "A maquininha não respondeu");
  };

  const ativa = !!config?.enabled;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <img src={getnetLogo} alt="Getnet" className="h-5 w-5 object-contain" />
              Maquininha integrada (TEF)
              {ativa ? (
                <Badge className="bg-emerald-600">Ativa</Badge>
              ) : (
                <Badge variant="secondary">Desligada</Badge>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              O caixa manda o valor para a maquininha e o comprovante volta sozinho, sem digitar NSU
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Cobrar na maquininha pelo PDV</Label>
                <p className="text-xs text-muted-foreground">
                  Aparece um botão na tela de pagamento em cartão
                </p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Como a maquininha é alcançada</Label>
              <Select
                value={form.provider}
                onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bridge">Pelo computador da loja (pinpad ou TEF local)</SelectItem>
                  <SelectItem value="getnet_cloud">Pela nuvem da Getnet (POS Integrado)</SelectItem>
                </SelectContent>
              </Select>
              {form.provider === "getnet_cloud" && (
                <p className="text-xs text-amber-600">
                  A nuvem depende do contrato de POS Integrado com a Getnet e das credenciais do
                  terminal. Enquanto isso não vier, use o computador da loja.
                </p>
              )}
            </div>

            {form.provider === "bridge" && (
              <div className="space-y-2">
                <Label className="text-xs">Computador com a maquininha</Label>
                <Select
                  value={form.install_id ?? ""}
                  onValueChange={(v) => setForm((f) => ({ ...f, install_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha a instalação" /></SelectTrigger>
                  <SelectContent>
                    {pontes.map((p: any) => (
                      <SelectItem key={p.install_id} value={p.install_id}>
                        {p.hostname || p.install_id.slice(0, 8)}
                        {p.version ? ` · ponte ${p.version}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pontes.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma ponte instalada aparece aqui. Instale a ponte no computador do caixa primeiro.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Nome do terminal</Label>
                <Input
                  placeholder="Caixa 1"
                  value={form.terminal_label}
                  onChange={(e) => setForm((f) => ({ ...f, terminal_label: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Tempo de espera (segundos)</Label>
                <Input
                  type="number"
                  min={30}
                  max={600}
                  value={form.timeout_seconds}
                  onChange={(e) => setForm((f) => ({ ...f, timeout_seconds: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salvar
              </Button>
              {ativa && (
                <Button
                  variant="outline"
                  onClick={testar}
                  disabled={tef.status === "pending" || tef.status === "processing"}
                >
                  {tef.status === "pending" || tef.status === "processing" ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Falando com a maquininha...</>
                  ) : (
                    <><CreditCard className="h-4 w-4 mr-2" /> Testar</>
                  )}
                </Button>
              )}
              {tef.status === "approved" && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> respondeu
                </span>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              O comprovante do cliente e o NSU voltam da maquininha e ficam gravados no pagamento,
              no fechamento de caixa e nos relatórios. Se a maquininha não responder, o caixa segue
              podendo registrar o pagamento normalmente.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
