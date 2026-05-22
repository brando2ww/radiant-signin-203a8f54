import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, Gift, Palette, Clock, Trophy, AlertCircle } from "lucide-react";
import { useCampaignPrizes, useCreatePrize, useUpdatePrize, useDeletePrize, type CampaignPrize, type CampaignPrizeRewardType } from "@/hooks/use-campaign-prizes";
import { useUpdateCampaign, useEvaluationCampaigns } from "@/hooks/use-evaluation-campaigns";
import { PrizeDialog } from "./PrizeDialog";
import { RoulettePreview } from "./RoulettePreview";

interface CampaignRouletteProps {
  campaignId: string;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-12 rounded-xl cursor-pointer border-2 border-input hover:border-primary transition-colors"
        />
        <Input
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
          className="h-10 w-28 font-mono text-sm uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

export function CampaignRoulette({ campaignId }: CampaignRouletteProps) {
  const { data: prizes = [], isLoading } = useCampaignPrizes(campaignId);
  const { data: campaigns } = useEvaluationCampaigns();
  const campaign = campaigns?.find((c) => c.id === campaignId) as any;
  const rouletteEnabled = campaign?.roulette_enabled ?? false;
  const wheelPrimary = campaign?.wheel_primary_color || "#1a1a2e";
  const wheelSecondary = campaign?.wheel_secondary_color || "#722F37";
  const cooldownHours = campaign?.roulette_cooldown_hours ?? 0;

  const updateCampaign = useUpdateCampaign();
  const createPrize = useCreatePrize();
  const updatePrize = useUpdatePrize();
  const deletePrize = useDeletePrize();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<CampaignPrize | null>(null);

  const totalProbability = prizes.reduce((s, p) => s + Number(p.probability), 0);

  const handleFieldSave = useCallback((field: string, value: any) => {
    updateCampaign.mutate({ id: campaignId, [field]: value } as any);
  }, [campaignId, updateCampaign]);

  const handleToggle = (checked: boolean) => {
    updateCampaign.mutate({ id: campaignId, roulette_enabled: checked } as any);
  };

  const handleSave = (data: { name: string; color: string; probability: number; max_quantity: number | null; coupon_validity_days: number; reward_type: CampaignPrizeRewardType; reward_value: number | null }) => {
    if (editingPrize) {
      updatePrize.mutate({ id: editingPrize.id, campaign_id: campaignId, ...data }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createPrize.mutate({ campaign_id: campaignId, ...data }, { onSuccess: () => setDialogOpen(false) });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${wheelPrimary}, ${wheelSecondary})` }}>
                <Gift className="h-5 w-5 text-white" />
              </div>
              <div>
                <Label className="text-base font-semibold">Roleta de Prêmios</Label>
                <p className="text-sm text-muted-foreground">
                  Quando ativa, o cliente gira a roleta antes de preencher a avaliação
                </p>
              </div>
            </div>
            <Switch checked={rouletteEnabled} onCheckedChange={handleToggle} />
          </div>
        </CardContent>
      </Card>

      {/* Colors + Cooldown */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Aparência da Roleta</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-muted/50 border">
            <ColorInput label="Cor Primária" value={wheelPrimary} onChange={(v) => handleFieldSave("wheel_primary_color", v)} />
            <ColorInput label="Cor Secundária" value={wheelSecondary} onChange={(v) => handleFieldSave("wheel_secondary_color", v)} />
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Cooldown
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  defaultValue={cooldownHours}
                  onBlur={(e) => handleFieldSave("roulette_cooldown_hours", Number(e.target.value))}
                  className="h-10 w-20"
                />
                <span className="text-xs text-muted-foreground">horas</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Intervalo entre giros do mesmo cliente</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        {/* Prizes list */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Prêmios ({prizes.length})</CardTitle>
              </div>
              <Button size="sm" onClick={() => { setEditingPrize(null); setDialogOpen(true); }} className="gap-1.5 h-8">
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Probability bar */}
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Soma das probabilidades</span>
                <span className={totalProbability === 100 ? "text-green-600 font-bold" : "text-destructive font-bold"}>
                  {totalProbability}%
                </span>
              </div>
              <Progress value={Math.min(totalProbability, 100)} className="h-2" />
              {totalProbability !== 100 && prizes.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  <span>A soma deve ser exatamente 100%</span>
                </div>
              )}
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : prizes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Gift className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum prêmio cadastrado</p>
                <p className="text-xs">Adicione prêmios para configurar a roleta</p>
              </div>
            ) : (
              <div className="space-y-2">
                {prizes.map((prize, i) => (
                  <div key={prize.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-shadow">
                    <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: i % 2 === 0 ? wheelPrimary : wheelSecondary }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium text-sm truncate ${prize.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}>{prize.name}</p>
                        {!prize.is_active && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inativo</Badge>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 max-w-[120px]">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(Number(prize.probability), 100)}%`, backgroundColor: i % 2 === 0 ? wheelPrimary : wheelSecondary }} />
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">{Number(prize.probability)}%</span>
                        <span className="text-xs text-muted-foreground">{prize.max_quantity !== null ? `${prize.redeemed_count}/${prize.max_quantity}` : "∞"}</span>
                        <span className="text-xs text-muted-foreground">{prize.coupon_validity_days}d</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingPrize(prize); setDialogOpen(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deletePrize.mutate({ id: prize.id, campaign_id: campaignId })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview */}
        {prizes.length > 0 && (
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-center text-muted-foreground">Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-6">
              <div className="p-4 rounded-2xl bg-muted/30 border">
                <RoulettePreview prizes={prizes} size={280} primaryColor={wheelPrimary} secondaryColor={wheelSecondary} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <PrizeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        prize={editingPrize}
        onSave={handleSave}
        saving={createPrize.isPending || updatePrize.isPending}
      />
    </div>
  );
}
