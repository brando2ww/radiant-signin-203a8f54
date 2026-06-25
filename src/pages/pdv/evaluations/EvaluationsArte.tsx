import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { Printer, Download, FileText, Loader2, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEvaluationCampaigns } from "@/hooks/use-evaluation-campaigns";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import { cn } from "@/lib/utils";
import velaraLogo from "@/assets/logo_velara_preto.png";

type Size = "a4" | "a5" | "label";

const SIZE_DIMENSIONS: Record<
  Size,
  { w: number; h: number; label: string; pdfFormat: any; scale: number }
> = {
  a4: { w: 794, h: 1123, label: "A4 (210×297mm)", pdfFormat: "a4", scale: 0.5 },
  a5: { w: 559, h: 794, label: "A5 (148×210mm)", pdfFormat: "a5", scale: 0.65 },
  label: { w: 378, h: 378, label: "Etiqueta 10×10cm", pdfFormat: [100, 100], scale: 0.9 },
};

export default function EvaluationsArte() {
  const [searchParams] = useSearchParams();
  const initialCampaign = searchParams.get("campaign") ?? "";

  const { data: campaigns = [], isLoading: loadingCampaigns } = useEvaluationCampaigns();
  const { settings } = useBusinessSettings();

  const [campaignId, setCampaignId] = useState<string>(initialCampaign);
  const [size, setSize] = useState<Size>("a4");
  const [coloredAccent, setColoredAccent] = useState(true);
  const [exporting, setExporting] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  // pick first active campaign by default
  useEffect(() => {
    if (campaignId) return;
    const first = campaigns.find((c) => c.is_active) ?? campaigns[0];
    if (first) setCampaignId(first.id);
  }, [campaigns, campaignId]);

  const campaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId) ?? null,
    [campaigns, campaignId],
  );

  const url = campaign ? `${window.location.origin}/avaliacao/${campaign.id}` : "";
  const shortUrl = url.replace(/^https?:\/\//, "");
  const domainOnly = shortUrl.split("/")[0];
  const isLabel = size === "label";
  const dim = SIZE_DIMENSIONS[size];

  const businessName = settings?.business_name ?? "";
  const logoUrl = settings?.logo_url ?? "";

  const safeFileName = (campaign?.name ?? "avaliacao")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

  const handlePrint = () => window.print();

  const handleDownloadPng = async () => {
    if (!posterRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(posterRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `arte-avaliacao-${safeFileName}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!posterRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(posterRef.current, { pixelRatio: 2, cacheBust: true });
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: dim.pdfFormat,
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, "PNG", 0, 0, pageW, pageH);
      pdf.save(`arte-avaliacao-${safeFileName}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2 print:hidden">
        <QrCode className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">Arte para o caixa</h1>
          <p className="text-sm text-muted-foreground">
            Imprima e exponha próximo ao caixa para coletar avaliações dos clientes.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-6">
        {/* Controls */}
        <Card className="print:hidden h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Personalização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Campanha</Label>
              <Select
                value={campaignId || "none"}
                onValueChange={(v) => setCampaignId(v === "none" ? "" : v)}
                disabled={loadingCampaigns || campaigns.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma campanha" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhuma campanha cadastrada
                    </SelectItem>
                  ) : (
                    campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.is_active ? "" : "(inativa)"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tamanho da arte</Label>
              <Tabs value={size} onValueChange={(v) => setSize(v as Size)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="a4">A4</TabsTrigger>
                  <TabsTrigger value="a5">A5</TabsTrigger>
                  <TabsTrigger value="label">10×10</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground">{dim.label}</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-3">
                <Label>Detalhe colorido</Label>
                <p className="text-xs text-muted-foreground">
                  Faixa superior na cor primária do app
                </p>
              </div>
              <Switch checked={coloredAccent} onCheckedChange={setColoredAccent} />
            </div>

            <div className="grid grid-cols-1 gap-2 pt-2">
              <Button onClick={handlePrint} disabled={!campaign}>
                <Printer className="h-4 w-4 mr-2" /> Imprimir
              </Button>
              <Button
                onClick={handleDownloadPdf}
                variant="outline"
                disabled={!campaign || exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Baixar PDF
              </Button>
              <Button
                onClick={handleDownloadPng}
                variant="outline"
                disabled={!campaign || exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Baixar PNG
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <div className="flex justify-center bg-muted/30 rounded-lg p-4 print:bg-transparent print:p-0 overflow-auto">
          {!campaign ? (
            <div className="h-[400px] flex items-center justify-center text-sm text-muted-foreground">
              Selecione uma campanha para gerar a arte.
            </div>
          ) : (
            <>
              {/* Visual scaled wrapper (preview only) — reserves exact scaled space */}
              <div
                className="print:hidden"
                style={{
                  width: dim.w * dim.scale,
                  height: dim.h * dim.scale,
                  flexShrink: 0,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: dim.w,
                    height: dim.h,
                    transform: `scale(${dim.scale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <PosterContent
                    size={size}
                    isLabel={isLabel}
                    coloredAccent={coloredAccent}
                    logoUrl={logoUrl}
                    businessName={businessName}
                    url={url}
                    domainOnly={domainOnly}
                    dim={dim}
                  />
                </div>
              </div>

              {/* Real-size hidden export node + print node */}
              <div
                style={{
                  position: "fixed",
                  left: -99999,
                  top: 0,
                  width: dim.w,
                  height: dim.h,
                  pointerEvents: "none",
                }}
                className="print:static print:left-0 print:top-0"
                aria-hidden
              >
                <div
                  ref={posterRef}
                  className="qr-poster"
                  style={{ width: dim.w, height: dim.h, background: "#fff" }}
                >
                  <PosterContent
                    size={size}
                    isLabel={isLabel}
                    coloredAccent={coloredAccent}
                    logoUrl={logoUrl}
                    businessName={businessName}
                    url={url}
                    domainOnly={domainOnly}
                    dim={dim}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .qr-poster, .qr-poster * { visibility: visible; }
          .qr-poster {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: ${size === "label" ? "100mm" : size === "a5" ? "148mm" : "210mm"} !important;
            height: ${size === "label" ? "100mm" : size === "a5" ? "210mm" : "297mm"} !important;
            box-shadow: none !important;
          }
          @page { margin: 0; size: ${size === "label" ? "100mm 100mm" : size}; }
        }
      `}</style>
    </div>
  );
}

type PosterProps = {
  size: Size;
  isLabel: boolean;
  coloredAccent: boolean;
  logoUrl: string;
  businessName: string;
  url: string;
  domainOnly: string;
  dim: { w: number; h: number };
};

function PosterContent({
  size,
  isLabel,
  coloredAccent,
  logoUrl,
  businessName,
  url,
  domainOnly,
}: PosterProps) {
  const isA5 = size === "a5";
  const padding = isLabel ? 16 : isA5 ? 36 : 56;
  const accentH = isLabel ? 6 : isA5 ? 10 : 14;
  const logoH = isLabel ? 70 : isA5 ? 130 : 200;
  const headlineSize = isLabel ? 20 : isA5 ? 36 : 60;
  const headlineGap = isLabel ? 8 : isA5 ? 22 : 36;
  const qrPadding = isLabel ? 6 : isA5 ? 14 : 20;
  const qrSize = isLabel ? 170 : isA5 ? 240 : 400;
  const qrGap = isLabel ? 10 : isA5 ? 24 : 40;
  const instructionSize = isLabel ? 12 : isA5 ? 18 : 26;
  const instructionGap = isLabel ? 8 : isA5 ? 18 : 28;
  const subInstructionSize = isA5 ? 13 : 18;
  const footerPad = isLabel ? 6 : isA5 ? 18 : 28;
  const dividerW = isLabel ? 40 : isA5 ? 90 : 120;
  const dividerMb = isLabel ? 4 : isA5 ? 10 : 16;
  const businessSize = isLabel ? 10 : isA5 ? 13 : 16;

  return (
    <div
      className="relative bg-white text-foreground flex flex-col h-full w-full"
      style={{ width: "100%", height: "100%" }}
    >
      {coloredAccent && (
        <div
          className="w-full"
          style={{ height: accentH, background: "hsl(var(--primary))" }}
        />
      )}

      <div
        className="flex-1 flex flex-col items-center min-h-0"
        style={{ padding }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center" style={{ height: logoH }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={businessName}
              crossOrigin="anonymous"
              style={{ maxHeight: logoH, maxWidth: "80%", objectFit: "contain" }}
            />
          ) : (
            <span
              className="font-semibold tracking-tight text-foreground"
              style={{ fontSize: isLabel ? 18 : isA5 ? 26 : 36 }}
            >
              {businessName || "Seu estabelecimento"}
            </span>
          )}
        </div>

        {/* Headline */}
        <div className="text-center" style={{ marginTop: headlineGap }}>
          <h2
            className="font-bold leading-[1.05] tracking-tight"
            style={{ fontSize: headlineSize }}
          >
            Sua opinião
          </h2>
          <h2
            className="font-bold leading-[1.05] tracking-tight"
            style={{ fontSize: headlineSize, color: "hsl(var(--primary))" }}
          >
            vale um agrado
          </h2>
        </div>

        {/* QR */}
        <div
          className="bg-white rounded-2xl border"
          style={{
            marginTop: qrGap,
            padding: qrPadding,
            boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
          }}
        >
          <QRCodeSVG value={url} size={qrSize} level="H" includeMargin={false} />
        </div>

        {/* Instruction */}
        <p
          className="font-semibold text-center"
          style={{ marginTop: instructionGap, fontSize: instructionSize }}
        >
          Aponte a câmera do celular
        </p>
        {!isLabel && (
          <p
            className="text-center text-muted-foreground"
            style={{ fontSize: subInstructionSize, marginTop: 4 }}
          >
            Avalie e ganhe um cupom na hora
          </p>
        )}

        {/* Footer */}
        <div className="mt-auto w-full text-center" style={{ paddingTop: footerPad }}>
          <div
            className="mx-auto"
            style={{
              height: 2,
              width: dividerW,
              background: "hsl(var(--primary))",
              marginBottom: dividerMb,
            }}
          />
          {businessName && (
            <p
              className="font-medium text-foreground truncate"
              style={{ fontSize: businessSize }}
            >
              {businessName}
            </p>
          )}
          {!isLabel && (
            <p
              className="font-mono text-muted-foreground truncate"
              style={{ fontSize: isA5 ? 11 : 12, marginTop: 2 }}
            >
              {domainOnly}
            </p>
          )}
          <div
            className="flex items-center justify-center gap-1"
            style={{ marginTop: isLabel ? 4 : isA5 ? 8 : 12 }}
          >
            <span
              style={{
                fontSize: isLabel ? 7 : isA5 ? 9 : 10,
                color: "#9ca3af",
                letterSpacing: "0.04em",
              }}
            >
              powered by
            </span>
            <img
              src={velaraLogo}
              alt="Velara"
              crossOrigin="anonymous"
              style={{
                height: isLabel ? 10 : isA5 ? 14 : 18,
                width: "auto",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
