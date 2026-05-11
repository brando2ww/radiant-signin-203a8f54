import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ExternalLink, QrCode, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  useEvaluationCampaigns,
  useUpdateCampaign,
} from "@/hooks/use-evaluation-campaigns";
import { CampaignQuestionManager } from "./CampaignQuestionManager";
import { CampaignResponses } from "./CampaignResponses";
import { CampaignReports } from "./CampaignReports";

import { CampaignLeads } from "./CampaignLeads";
import { CampaignRoulette } from "./CampaignRoulette";
import { EditCampaignDialog } from "./EditCampaignDialog";

interface CampaignDetailProps {
  campaignId: string;
}

export function CampaignDetail({ campaignId }: CampaignDetailProps) {
  const { data: campaigns } = useEvaluationCampaigns();
  const updateCampaign = useUpdateCampaign();
  const [editOpen, setEditOpen] = useState(false);
  const campaign = campaigns?.find((c) => c.id === campaignId);

  if (!campaign) return null;

  const publicUrl = `${window.location.origin}/avaliacao/${campaignId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copiado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold truncate">{campaign.name}</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setEditOpen(true)}
              aria-label="Editar campanha"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          {campaign.description && (
            <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="campaign-active" className="text-sm">Ativa</Label>
          <Switch
            id="campaign-active"
            checked={campaign.is_active}
            onCheckedChange={(checked) =>
              updateCampaign.mutate({ id: campaignId, is_active: checked })
            }
          />
        </div>
      </div>

      {/* QR Code + Link */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-4 w-4" /> Link Público & QR Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="bg-white p-4 rounded-lg border">
              <QRCodeSVG value={publicUrl} size={160} />
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-sm text-muted-foreground">
                Compartilhe este link ou QR Code com seus clientes para que possam avaliar o estabelecimento.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm truncate">{publicUrl}</code>
                <Button variant="outline" size="icon" onClick={copyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/pdv/avaliacoes/arte?campaign=${campaignId}`}>
                    <Printer className="h-4 w-4 mr-2" /> Gerar arte
                  </Link>
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={campaign.is_active ? "default" : "destructive"}>
                  {campaign.is_active ? "Recebendo respostas" : "Campanha desativada"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {campaign.total_responses} respostas recebidas
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="questions">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="questions">Perguntas</TabsTrigger>
          <TabsTrigger value="roulette">Roleta</TabsTrigger>
          
          <TabsTrigger value="leads">Leads ({campaign.total_responses})</TabsTrigger>
          <TabsTrigger value="responses">Respostas</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
        </TabsList>
        <TabsContent value="questions" className="mt-4">
          <CampaignQuestionManager campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="roulette" className="mt-4">
          <CampaignRoulette campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="leads" className="mt-4">
          <CampaignLeads campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="responses" className="mt-4">
          <CampaignResponses campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <CampaignReports campaignId={campaignId} />
        </TabsContent>
      </Tabs>

      <EditCampaignDialog
        campaign={campaign}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
