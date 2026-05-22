import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CircleDot, Plus, Pencil, Trash2, Clock, Palette, Gift, Trophy, AlertCircle } from "lucide-react";
import { useEvaluationCampaigns, useUpdateCampaign } from "@/hooks/use-evaluation-campaigns";
import { useCampaignPrizes, useCreatePrize, useUpdatePrize, useDeletePrize, type CampaignPrize, type CampaignPrizeRewardType } from "@/hooks/use-campaign-prizes";
import { RoulettePreview } from "@/components/pdv/evaluations/RoulettePreview";
import { PrizeDialog } from "@/components/pdv/evaluations/PrizeDialog";

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-12 h-12 rounded-xl cursor-pointer border-2 border-input hover:border-primary transition-colors"
          />
        </div>
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

function PrizeCard({ prize, index, primaryColor, secondaryColor, onEdit, onDelete }: {
  prize: CampaignPrize;
  index: number;
  primaryColor: string;
  secondaryColor: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const wheelColor = index % 2 === 0 ? primaryColor : secondaryColor;
  const prob = Number(prize.probability);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-shadow">
      <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: wheelColor }}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className={`font-medium text-sm truncate ${prize.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}>
            {prize.name}
          </p>
          {!prize.is_active && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inativo</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-[120px]">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(prob, 100)}%`, backgroundColor: wheelColor }} />
            </div>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">{prob}%</span>
          <span className="text-xs text-muted-foreground">
            {prize.max_quantity !== null ? `${prize.redeemed_count}/${prize.max_quantity}` : "∞"}
          </span>
          <span className="text-xs text-muted-foreground">{prize.coupon_validity_days}d</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function CampaignRouletteCard({ campaign }: { campaign: any }) {
  const { data: prizes = [] } = useCampaignPrizes(campaign.id);
  const updateCampaign = useUpdateCampaign();
  const createPrize = useCreatePrize();
  const updatePrize = useUpdatePrize();
  const deletePrize = useDeletePrize();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<CampaignPrize | null>(null);

  const wheelPrimary = campaign.wheel_primary_color || "#1a1a2e";
  const wheelSecondary = campaign.wheel_secondary_color || "#722F37";
  const cooldownHours = campaign.roulette_cooldown_hours ?? 0;
  const rouletteEnabled = campaign.roulette_enabled ?? false;

  const totalProbability = prizes.reduce((s: number, p: CampaignPrize) => s + Number(p.probability), 0);

  const handleFieldSave = useCallback((field: string, value: any) => {
    updateCampaign.mutate({ id: campaign.id, [field]: value } as any);
  }, [campaign.id, updateCampaign]);

  const handlePrizeSave = (data: { name: string; color: string; probability: number; max_quantity: number | null; coupon_validity_days: number; reward_type: CampaignPrizeRewardType; reward_value: number | null }) => {
    if (editingPrize) {
      updatePrize.mutate({ id: editingPrize.id, campaign_id: campaign.id, ...data }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createPrize.mutate({ campaign_id: campaign.id, ...data }, { onSuccess: () => setDialogOpen(false) });
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${wheelPrimary}, ${wheelSecondary})` }}>
              <Gift className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{campaign.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Configuração da roleta de prêmios</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={campaign.is_active ? "secondary" : "destructive"}>
              {campaign.is_active ? "Ativa" : "Inativa"}
            </Badge>
            <Switch checked={rouletteEnabled} onCheckedChange={(v) => handleFieldSave("roulette_enabled", v)} />
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          {/* Left: Config */}
          <div className="space-y-6">
            {/* Colors + Cooldown Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Aparência da Roleta</h3>
              </div>
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
            </div>

            <Separator />

            {/* Prizes Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Prêmios ({prizes.length})</h3>
                </div>
                <Button size="sm" onClick={() => { setEditingPrize(null); setDialogOpen(true); }} className="gap-1.5 h-8">
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>

              {/* Probability indicator */}
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

              {/* Prize cards */}
              <div className="space-y-2">
                {prizes.map((p, i) => (
                  <PrizeCard
                    key={p.id}
                    prize={p}
                    index={i}
                    primaryColor={wheelPrimary}
                    secondaryColor={wheelSecondary}
                    onEdit={() => { setEditingPrize(p); setDialogOpen(true); }}
                    onDelete={() => deletePrize.mutate({ id: p.id, campaign_id: campaign.id })}
                  />
                ))}
                {prizes.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Gift className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhum prêmio cadastrado</p>
                    <p className="text-xs">Adicione prêmios para configurar a roleta</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex flex-col items-center gap-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Preview</h3>
            <div className="sticky top-4 p-6 rounded-2xl bg-muted/30 border">
              <RoulettePreview
                prizes={prizes}
                size={280}
                primaryColor={wheelPrimary}
                secondaryColor={wheelSecondary}
              />
            </div>
          </div>
        </div>
      </CardContent>

      <PrizeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        prize={editingPrize}
        onSave={handlePrizeSave}
        saving={createPrize.isPending || updatePrize.isPending}
      />
    </Card>
  );
}

export default function CouponsRoulettes() {
  const { data: campaigns = [], isLoading } = useEvaluationCampaigns();
  const rouletteCampaigns = campaigns.filter((c: any) => c.roulette_enabled !== false);

  if (isLoading) return <div className="p-4 md:p-6"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CircleDot className="h-6 w-6 text-primary" />
          Roletas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Configure as cores, prêmios e cooldown de cada roleta</p>
      </div>

      {rouletteCampaigns.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <CircleDot className="h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">Nenhuma campanha com roleta encontrada</p>
              <p className="text-xs">Ative a roleta em uma campanha para configurá-la aqui</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {rouletteCampaigns.map((c) => (
            <CampaignRouletteCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}
