import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, AlertCircle } from "lucide-react";
import { useUpdateCampaign, type CampaignWithStats, type GoogleRedirectMode } from "@/hooks/use-evaluation-campaigns";
import { useBusinessSettings } from "@/hooks/use-business-settings";

interface EditCampaignDialogProps {
  campaign: Pick<CampaignWithStats, "id" | "name" | "description"> & { google_redirect_mode?: GoogleRedirectMode };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCampaignDialog({ campaign, open, onOpenChange }: EditCampaignDialogProps) {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [redirectMode, setRedirectMode] = useState<GoogleRedirectMode>(campaign.google_redirect_mode ?? "promoters");
  const updateCampaign = useUpdateCampaign();
  const { settings } = useBusinessSettings();
  const hasGoogleUrl = !!settings?.google_review_url;

  useEffect(() => {
    if (open) {
      setName(campaign.name);
      setDescription(campaign.description ?? "");
      setRedirectMode(campaign.google_redirect_mode ?? "promoters");
    }
  }, [open, campaign.name, campaign.description, campaign.google_redirect_mode]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    updateCampaign.mutate(
      {
        id: campaign.id,
        name: name.trim(),
        description: description.trim() || undefined,
        google_redirect_mode: redirectMode,
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Editar Campanha</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-campaign-name">Nome da campanha *</Label>
            <Input
              id="edit-campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Pesquisa de Satisfação Janeiro"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-campaign-desc">Descrição (opcional)</Label>
            <Textarea
              id="edit-campaign-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o objetivo da campanha..."
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-campaign-google">Encaminhar ao Google ao final</Label>
            <Select value={redirectMode} onValueChange={(v) => setRedirectMode(v as GoogleRedirectMode)}>
              <SelectTrigger id="edit-campaign-google">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Desativado</SelectItem>
                <SelectItem value="promoters">Apenas promotores (NPS 9–10)</SelectItem>
                <SelectItem value="always">Sempre — todos os clientes</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Quando ativo, o cliente é direcionado ao Google após ver o cupom (se houver).
            </p>
            {redirectMode !== "off" && !hasGoogleUrl && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span>Link do Google não configurado.</span>
                  <Link
                    to="/avaliacoes/configuracoes"
                    className="inline-flex items-center gap-1 underline text-sm"
                  >
                    Configurar <ExternalLink className="h-3 w-3" />
                  </Link>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || updateCampaign.isPending}>
            {updateCampaign.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
