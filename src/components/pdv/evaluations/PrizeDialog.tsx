import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import type { CampaignPrize, CampaignPrizeRewardType } from "@/hooks/use-campaign-prizes";

interface PrizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prize?: CampaignPrize | null;
  onSave: (data: {
    name: string;
    color: string;
    probability: number;
    max_quantity: number | null;
    coupon_validity_days: number;
    reward_type: CampaignPrizeRewardType;
    reward_value: number | null;
  }) => void;
  saving?: boolean;
}

const rewardTypeLabels: Record<CampaignPrizeRewardType, string> = {
  percent: "Desconto em %",
  fixed: "Desconto em R$",
  free_product: "Produto grátis",
  manual: "Validar manualmente (sem desconto)",
};

const rewardTypeHelp: Record<CampaignPrizeRewardType, string> = {
  percent: "Aplica o percentual automaticamente no PDV ao validar o cupom.",
  fixed: "Aplica o valor fixo (R$) automaticamente no PDV ao validar o cupom.",
  free_product: "Fase futura — por ora, só marca o cupom como resgatado e avisa o operador.",
  manual: "Apenas marca o cupom como resgatado. Operador aplica brinde/cortesia à parte.",
};

export function PrizeDialog({ open, onOpenChange, prize, onSave, saving }: PrizeDialogProps) {
  const [name, setName] = useState("");
  const [probability, setProbability] = useState(10);
  const [maxQty, setMaxQty] = useState<string>("");
  const [validityDays, setValidityDays] = useState(7);
  const [rewardType, setRewardType] = useState<CampaignPrizeRewardType>("manual");
  const [rewardPercent, setRewardPercent] = useState<string>("");
  const [rewardFixed, setRewardFixed] = useState<string>("");

  useEffect(() => {
    if (prize) {
      setName(prize.name);
      setProbability(Number(prize.probability));
      setMaxQty(prize.max_quantity !== null ? String(prize.max_quantity) : "");
      setValidityDays(prize.coupon_validity_days);
      setRewardType(prize.reward_type ?? "manual");
      setRewardPercent(prize.reward_type === "percent" && prize.reward_value != null ? String(prize.reward_value) : "");
      setRewardFixed(prize.reward_type === "fixed" && prize.reward_value != null ? String(prize.reward_value) : "");
    } else {
      setName("");
      setProbability(10);
      setMaxQty("");
      setValidityDays(7);
      setRewardType("manual");
      setRewardPercent("");
      setRewardFixed("");
    }
  }, [prize, open]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    let rewardValue: number | null = null;
    if (rewardType === "percent") {
      const v = parseFloat(rewardPercent);
      if (!isFinite(v) || v <= 0 || v > 100) return;
      rewardValue = v;
    } else if (rewardType === "fixed") {
      const v = parseFloat(rewardFixed);
      if (!isFinite(v) || v <= 0) return;
      rewardValue = v;
    }
    onSave({
      name: name.trim(),
      color: prize?.color || "#6366f1",
      probability,
      max_quantity: maxQty ? parseInt(maxQty) : null,
      coupon_validity_days: validityDays,
      reward_type: rewardType,
      reward_value: rewardValue,
    });
  };

  const submitDisabled =
    !name.trim() ||
    saving ||
    (rewardType === "percent" && (!rewardPercent || parseFloat(rewardPercent) <= 0 || parseFloat(rewardPercent) > 100)) ||
    (rewardType === "fixed" && (!rewardFixed || parseFloat(rewardFixed) <= 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{prize ? "Editar Prêmio" : "Novo Prêmio"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do Prêmio *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: 10% OFF" />
          </div>

          <div className="space-y-2">
            <Label>Tipo de recompensa *</Label>
            <Select value={rewardType} onValueChange={(v) => setRewardType(v as CampaignPrizeRewardType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(rewardTypeLabels) as CampaignPrizeRewardType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {rewardTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{rewardTypeHelp[rewardType]}</p>
          </div>

          {rewardType === "percent" && (
            <div className="space-y-2">
              <Label>Percentual de desconto (%) *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={rewardPercent}
                onChange={(e) => setRewardPercent(e.target.value)}
                placeholder="Ex: 10"
              />
            </div>
          )}

          {rewardType === "fixed" && (
            <div className="space-y-2">
              <Label>Valor do desconto (R$) *</Label>
              <CurrencyInput value={rewardFixed} onChange={setRewardFixed} placeholder="0,00" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Probabilidade (%)</Label>
            <Input type="number" min={1} max={100} value={probability} onChange={(e) => setProbability(Number(e.target.value))} />
          </div>

          <div className="space-y-2">
            <Label>Quantidade Máxima (vazio = ilimitado)</Label>
            <Input type="number" min={1} value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder="Ilimitado" />
          </div>

          <div className="space-y-2">
            <Label>Validade do Cupom (dias)</Label>
            <Input type="number" min={1} value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
