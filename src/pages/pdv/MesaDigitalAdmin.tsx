import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { Copy, Download, ExternalLink, Loader2, QrCode, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePDVTables } from "@/hooks/use-pdv-tables";
import { useMesaConfig, useMesaQrCodes, urlDoQr, type MesaQr } from "@/hooks/use-mesa-digital";
import { formatTableLabel } from "@/utils/formatTableNumber";

const POR_PAGINA = 6;

export default function MesaDigitalAdmin() {
  const { config, salvar } = useMesaConfig();
  const { qrs, gerar, definirAtivo } = useMesaQrCodes();
  const { tables } = usePDVTables();
  const [confirmar, setConfirmar] = useState<{ tableIds: (string | null)[]; texto: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const folhasRef = useRef<HTMLDivElement>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const tipo = config?.tipo_qr ?? "por_mesa";
  const mesas = useMemo(
    () =>
      tables
        .filter((t) => !t.is_virtual && t.is_active !== false && !t.deleted_at)
        .sort((a, b) =>
          (parseInt(a.table_number.replace(/\D/g, ""), 10) || 9999) -
            (parseInt(b.table_number.replace(/\D/g, ""), 10) || 9999) ||
          a.table_number.localeCompare(b.table_number),
        ),
    [tables],
  );
  const qrDaMesa = (id: string) => qrs.find((q) => q.tipo === "mesa" && q.table_id === id);
  const qrGeral = qrs.find((q) => q.tipo === "geral");
  const semQr = mesas.filter((m) => !qrDaMesa(m.id));

  const cartazes: { titulo: string; qr: MesaQr }[] =
    tipo === "geral"
      ? qrGeral?.ativo ? [{ titulo: "Escolha sua mesa", qr: qrGeral }] : []
      : mesas
          .map((m) => ({ titulo: formatTableLabel(m.table_number), qr: qrDaMesa(m.id)! }))
          .filter((c) => c.qr?.ativo);
  const paginas = Array.from({ length: Math.ceil(cartazes.length / POR_PAGINA) }, (_, i) =>
    cartazes.slice(i * POR_PAGINA, (i + 1) * POR_PAGINA),
  );

  const executarGeracao = async () => {
    if (!confirmar) return;
    setGerando(true);
    try {
      for (const id of confirmar.tableIds) await gerar.mutateAsync(id);
      toast.success(confirmar.tableIds.length > 1 ? "QR codes gerados" : "QR code gerado");
    } catch (e: any) {
      toast.error("Não consegui gerar: " + (e?.message ?? "erro"));
    } finally {
      setGerando(false);
      setConfirmar(null);
    }
  };

  const baixarPdf = async () => {
    if (!folhasRef.current || paginas.length === 0) return;
    setExportando(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const folhas = Array.from(folhasRef.current.querySelectorAll<HTMLElement>("[data-folha]"));
      for (let i = 0; i < folhas.length; i++) {
        const img = await toPng(folhas[i], { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
        if (i > 0) pdf.addPage();
        pdf.addImage(img, "PNG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      }
      pdf.save(tipo === "geral" ? "qrcode-mesa-digital.pdf" : "qrcodes-mesas.pdf");
    } finally {
      setExportando(false);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Link copiado");
    } catch {
      toast.error("Não consegui copiar");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Mesa Digital</h1>
        <p className="text-sm text-muted-foreground">
          O cliente lê o QR code, informa nome e celular, vê o cardápio e pede pelo celular. O pedido sai
          direto na cozinha, a conta é uma por mesa e o pagamento continua no caixa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tipo de QR code</CardTitle>
          <CardDescription>
            Com um QR por mesa, o cliente já entra na mesa certa e é preciso estar nela para pedir. Com um
            QR geral, o cliente escolhe a mesa numa lista.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <RadioGroup
            value={tipo}
            onValueChange={(v) => salvar.mutate({ tipo_qr: v as "por_mesa" | "geral" })}
            className="grid gap-3 sm:grid-cols-2"
          >
            {[
              { v: "por_mesa", t: "Um QR por mesa", d: "Recomendado. Cada mesa tem o seu, com o número." },
              { v: "geral", t: "Um QR geral", d: "Um só para o salão; o cliente escolhe a mesa." },
            ].map((o) => (
              <Label key={o.v} className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
                <RadioGroupItem value={o.v} className="mt-0.5" />
                <span>
                  <span className="block font-medium">{o.t}</span>
                  <span className="block text-sm font-normal text-muted-foreground">{o.d}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>

          <div className="space-y-1.5">
            <Label>Mensagem de boas-vindas (opcional)</Label>
            <Textarea
              defaultValue={config?.mensagem_boas_vindas ?? ""}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Ex.: Bem-vindo! Peça pelo celular e chame o garçom quando precisar."
              rows={2}
            />
            {mensagem !== null && mensagem !== (config?.mensagem_boas_vindas ?? "") && (
              <Button size="sm" onClick={() => salvar.mutate({ mensagem_boas_vindas: mensagem.trim() || null })}>
                Salvar mensagem
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
            <div>
              <p className="font-medium">Mostrar a taxa de serviço na conta</p>
              <p className="text-sm text-muted-foreground">
                Usa o percentual configurado no PDV, quando a taxa está ligada.
              </p>
            </div>
            <Switch
              checked={config?.mostrar_taxa_servico ?? true}
              onCheckedChange={(v) => salvar.mutate({ mostrar_taxa_servico: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">QR codes</CardTitle>
            <CardDescription>
              Depois de gerado, o QR code é definitivo: o mesmo código vale para sempre. Se precisar tirar
              um de uso, desative.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {tipo === "por_mesa" && semQr.length > 0 && (
              <Button
                onClick={() =>
                  setConfirmar({
                    tableIds: semQr.map((m) => m.id),
                    texto: `Gerar o QR code definitivo de ${semQr.length} mesa(s)?`,
                  })
                }
              >
                <QrCode className="mr-2 h-4 w-4" /> Gerar para {semQr.length} mesa(s)
              </Button>
            )}
            <Button variant="outline" disabled={cartazes.length === 0 || exportando} onClick={baixarPdf}>
              {exportando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Baixar cartazes (PDF)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tipo === "geral" ? (
            qrGeral ? (
              <LinhaQr titulo="QR geral do salão" qr={qrGeral} onCopiar={copiar} onAtivo={(a) => definirAtivo.mutate({ id: qrGeral.id, ativo: a })} />
            ) : (
              <Button onClick={() => setConfirmar({ tableIds: [null], texto: "Gerar o QR code geral, definitivo?" })}>
                <QrCode className="mr-2 h-4 w-4" /> Gerar o QR geral
              </Button>
            )
          ) : mesas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cadastre as mesas no Salão para gerar os QR codes.</p>
          ) : (
            <div className="divide-y rounded-xl border">
              {mesas.map((m) => {
                const qr = qrDaMesa(m.id);
                return qr ? (
                  <LinhaQr key={m.id} titulo={formatTableLabel(m.table_number)} qr={qr} onCopiar={copiar}
                    onAtivo={(a) => definirAtivo.mutate({ id: qr.id, ativo: a })} />
                ) : (
                  <div key={m.id} className="flex items-center justify-between gap-3 p-3">
                    <span className="font-medium">{formatTableLabel(m.table_number)}</span>
                    <Button size="sm" variant="outline"
                      onClick={() => setConfirmar({ tableIds: [m.id], texto: `Gerar o QR code definitivo da ${formatTableLabel(m.table_number)}?` })}>
                      Gerar QR
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            O cliente vê os produtos do cadastro do salão, com o preço de salão. O que estiver escondido no{" "}
            <Link to="/pdv/cardapio-garcom" className="underline">Cardápio do garçom</Link> também fica escondido para
            o cliente. A mesa só abre com o caixa aberto.
          </p>
        </CardContent>
      </Card>

      {/* Folhas A4 para o PDF, fora da tela */}
      <div ref={folhasRef} className="pointer-events-none fixed -left-[10000px] top-0">
        {paginas.map((pagina, i) => (
          <div key={i} data-folha className="grid grid-cols-2 gap-6 bg-white p-10 text-black" style={{ width: 794, height: 1123 }}>
            {pagina.map((c) => (
              <div key={c.qr.id} className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-300 p-4">
                <p className="text-2xl font-bold">{c.titulo}</p>
                <QRCodeSVG value={urlDoQr(c.qr.token)} size={200} level="M" />
                <p className="text-center text-base font-semibold">Faça seu pedido pelo celular</p>
                <p className="text-center text-xs text-gray-500">Aponte a câmera para o QR code</p>
              </div>
            ))}
          </div>
        ))}
      </div>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar?.texto}</AlertDialogTitle>
            <AlertDialogDescription>
              O QR code gerado é definitivo: não muda nem pode ser apagado. Depois é só imprimir os cartazes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gerando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={gerando} onClick={(e) => { e.preventDefault(); executarGeracao(); }}>
              {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LinhaQr({ titulo, qr, onCopiar, onAtivo }: {
  titulo: string; qr: MesaQr; onCopiar: (t: string) => void; onAtivo: (ativo: boolean) => void;
}) {
  const url = urlDoQr(qr.token);
  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <QRCodeSVG value={url} size={56} level="M" className={qr.ativo ? "" : "opacity-30"} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">
          {titulo}
          {!qr.ativo && <Badge variant="secondary">desativado</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{url.replace(/^https?:\/\//, "")}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" title="Copiar link" onClick={() => onCopiar(url)}><Copy className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Abrir como cliente" asChild>
          <a href={url} target="_blank" rel="noopener"><ExternalLink className="h-4 w-4" /></a>
        </Button>
        <Switch checked={qr.ativo} onCheckedChange={onAtivo} title={qr.ativo ? "Ativo" : "Desativado"} />
      </div>
    </div>
  );
}
